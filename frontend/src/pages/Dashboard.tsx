// Dashboard page — main view with patient card, status hero, med list, and streak.

import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { getMedications, getEvents } from '../api/client';
import PatientCard from '../components/PatientCard';
import MedRow from '../components/MedRow';
import StreakWidget from '../components/StreakWidget';

export default function Dashboard() {
  const medications = useStore((s) => s.medications);
  const todayEvents = useStore((s) => s.todayEvents);
  const weekEvents = useStore((s) => s.weekEvents);
  const setMedications = useStore((s) => s.setMedications);
  const setTodayEvents = useStore((s) => s.setTodayEvents);
  const setWeekEvents = useStore((s) => s.setWeekEvents);

  useEffect(() => {
    getMedications().then(setMedications).catch(console.error);
    getEvents(1).then(setTodayEvents).catch(console.error);
    getEvents(7).then(setWeekEvents).catch(console.error);
  }, [setMedications, setTodayEvents, setWeekEvents]);

  // Status hero card — color based on overall today status.
  const totalToday = todayEvents.length;
  const completedToday = todayEvents.filter((e) => e.status === 'completed').length;
  const missedToday = todayEvents.filter((e) => e.status === 'missed').length;
  const pendingToday = todayEvents.filter((e) => e.status === 'pending').length;

  let heroColor = 'from-sage-500 to-sage-600';
  let heroLabel = 'All clear';
  let heroSub = 'No medications due yet today';

  if (totalToday > 0) {
    if (missedToday > 0) {
      heroColor = 'from-danger-400 to-danger-500';
      heroLabel = `${missedToday} Missed`;
      heroSub = 'Please check on Margaret';
    } else if (pendingToday > 0) {
      heroColor = 'from-amber-400 to-amber-500';
      heroLabel = `${pendingToday} Pending`;
      heroSub = 'Waiting for confirmation';
    } else if (completedToday === totalToday) {
      heroColor = 'from-sage-500 to-sage-600';
      heroLabel = 'All Taken ✓';
      heroSub = `${completedToday} dose${completedToday !== 1 ? 's' : ''} confirmed today`;
    }
  }

  return (
    <div className="space-y-4">
      <PatientCard />

      {/* Status hero */}
      <div className={`bg-gradient-to-br ${heroColor} rounded-2xl p-5 text-white shadow-md`}>
        <p className="font-display text-2xl">{heroLabel}</p>
        <p className="text-sm text-white/80 mt-1">{heroSub}</p>
      </div>

      {/* Medications */}
      <div>
        <h3 className="font-display text-base text-gray-900 mb-2 px-1">Today's Medications</h3>
        <div className="space-y-2">
          {medications.map((med) => (
            <MedRow
              key={med.id}
              name={med.name}
              dose={med.dose}
              events={todayEvents.filter((e) => e.medicationId === med.id)}
            />
          ))}
          {medications.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">No medications configured</p>
          )}
        </div>
      </div>

      {/* Streak */}
      <StreakWidget weekEvents={weekEvents} />
    </div>
  );
}
