import { useState, useEffect } from 'react';

// Declare a module-scoped variable to capture the event early.
// This is critical because beforeinstallprompt fires very early in the load cycle
// and can easily be missed by a React hook if registered late.
let deferredPrompt: any = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the default browser-level installation prompt info bar on mobile
    e.preventDefault();
    deferredPrompt = e;
    // Dispatch a custom event to notify any mounted hooks
    window.dispatchEvent(new Event('pwa-install-prompt-available'));
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    window.dispatchEvent(new Event('pwa-installed'));
  });
}

export function usePWAInstall() {
  const [isInstallable, setIsInstallable] = useState(!!deferredPrompt);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if the app is currently running in standalone display mode (already installed & launched)
    const isStandalone = 
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true || // For iOS Safari
      document.referrer.includes('android-app://');
    
    setIsInstalled(isStandalone);

    const handlePromptAvailable = () => {
      setIsInstallable(true);
    };

    const handleInstalled = () => {
      setIsInstallable(false);
      setIsInstalled(true);
    };

    window.addEventListener('pwa-install-prompt-available', handlePromptAvailable);
    window.addEventListener('pwa-installed', handleInstalled);

    // If the event has already fired and deferredPrompt is set, ensure state is set correctly
    if (deferredPrompt) {
      setIsInstallable(true);
    }

    return () => {
      window.removeEventListener('pwa-install-prompt-available', handlePromptAvailable);
      window.removeEventListener('pwa-installed', handleInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) {
      console.warn('PWA installation prompt is not available.');
      return false;
    }

    // Show the browser install prompt
    deferredPrompt.prompt();

    // Wait for the user's choice
    try {
      const { outcome } = await deferredPrompt.userChoice;
      
      // Clean up the deferred prompt since it can only be used once
      deferredPrompt = null;
      setIsInstallable(false);

      return outcome === 'accepted';
    } catch (error) {
      console.error('Error during PWA installation prompt:', error);
      return false;
    }
  };

  return { isInstallable, isInstalled, install };
}
