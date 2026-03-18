// PatientCard — hero card showing patient info and device status.

import { useStore } from '../store/useStore';

export default function PatientCard() {
  const deviceConnected = useStore((s) => s.deviceConnected);

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-cream-200">
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div className="w-12 h-12 rounded-full bg-sage-100 flex items-center justify-center text-sage-600 font-display text-xl font-bold shrink-0">
          M
        </div>

        <div className="flex-1 min-w-0">
          <h2 className="font-display text-lg text-gray-900 leading-tight">
            Margaret <span className="text-gray-400 font-body text-sm">(Mom)</span>
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">Patient</p>
        </div>

        {/* Device badge */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
            deviceConnected
              ? 'bg-sage-50 text-sage-600'
              : 'bg-danger-50 text-danger-500'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              deviceConnected ? 'bg-sage-500 animate-pulse' : 'bg-danger-400'
            }`}
          />
          {deviceConnected ? 'Online' : 'Offline'}
        </div>
      </div>
    </div>
  );
}
