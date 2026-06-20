import { useRegisterSW } from 'virtual:pwa-register/react';

function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      if (r) {
        setInterval(() => {
          r.update();
        }, 60 * 60 * 1000); // Check for server-side updates hourly
      }
    },
  });

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  if (!offlineReady && !needRefresh) return null;

  return (
    <div className="pwa-toast" style={{ position: 'fixed', bottom: 20, right: 20, background: '#fff', border: '1px solid #ccc', padding: 15, zIndex: 999 }}>
      <div>
        {offlineReady 
          ? <span>Application cached. Ready to run offline.</span> 
          : <span>New update available. Click reload to patch.</span>
        }
      </div>
      {needRefresh && <button onClick={() => updateServiceWorker(true)}>Reload</button>}
      <button onClick={close}>Close</button>
    </div>
  );
}

export default ReloadPrompt;