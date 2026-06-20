import { useState, useEffect } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export default function PWAInstallBanner() {
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Check if the user already dismissed the banner in the current session
    const isDismissed = sessionStorage.getItem('pwa-install-dismissed') === 'true';
    if (isInstallable && !isInstalled && !isDismissed) {
      setVisible(true);
    } else {
      setVisible(false);
    }
  }, [isInstallable, isInstalled]);

  const handleInstall = async () => {
    const success = await install();
    if (success) {
      setVisible(false);
    }
  };

  const handleDismiss = () => {
    sessionStorage.setItem('pwa-install-dismissed', 'true');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="glass border border-cream-200 rounded-2xl p-4 shadow-lg flex items-center justify-between gap-4 animate-slideUp">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-sage-50 border border-sage-100 flex items-center justify-center flex-shrink-0">
          <DownloadIcon className="w-5 h-5 text-sage-500 animate-bounce" />
        </div>
        <div>
          <p className="font-semibold text-gray-900 text-xs">Install ShebaKit App</p>
          <p className="text-[10px] text-gray-500 leading-normal mt-0.5">
            Add to home screen for offline access & faster monitoring.
          </p>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <button
          onClick={handleInstall}
          className="bg-sage-500 hover:bg-sage-600 text-white text-[11px] font-semibold px-3.5 py-2 rounded-lg transition-colors shadow-sm active:scale-95 whitespace-nowrap"
        >
          Install
        </button>
        <button
          onClick={handleDismiss}
          className="p-1.5 hover:bg-cream-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Dismiss prompt"
        >
          <CloseIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
