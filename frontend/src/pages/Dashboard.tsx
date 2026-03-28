// Dashboard page — main view with patient card, status hero, med list, and streak.

import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { getMedications, getEvents, getTodayStatus } from '../api/client';
import PatientCard from '../components/PatientCard';
import MedRow from '../components/MedRow';
import StreakWidget from '../components/StreakWidget';

export default function Dashboard() {
  const medications = useStore((s) => s.medications);
  const todayEvents = useStore((s) => s.todayEvents);
  const weekEvents = useStore((s) => s.weekEvents);
  const todayDoses = useStore((s) => s.todayDoses);
  const setMedications = useStore((s) => s.setMedications);
  const setTodayEvents = useStore((s) => s.setTodayEvents);
  const setWeekEvents = useStore((s) => s.setWeekEvents);
  const setTodayDoses = useStore((s) => s.setTodayDoses);

  useEffect(() => {
    getMedications().then(setMedications).catch(console.error);
    getEvents(1).then(setTodayEvents).catch(console.error);
    getEvents(7).then(setWeekEvents).catch(console.error);
    getTodayStatus().then(setTodayDoses).catch(console.error);
  }, [setMedications, setTodayEvents, setWeekEvents, setTodayDoses]);

  // Status hero card — derived from todayDoses (schedule-aware).
  const totalDoses = todayDoses.length;
  const completedDoses = todayDoses.filter((d) => d.status === 'completed').length;
  const missedDoses = todayDoses.filter((d) => d.status === 'missed').length;
  const pendingDoses = todayDoses.filter((d) => d.status === 'pending').length;
  const dueDoses = todayDoses.filter((d) => d.status === 'due').length;
  const upcomingDoses = todayDoses.filter((d) => d.status === 'upcoming').length;

  let heroColor = 'from-sage-500 to-sage-600';
  let heroLabel = 'All clear';
  let heroSub = 'No medications scheduled today';

  if (totalDoses > 0) {
    if (missedDoses > 0) {
      heroColor = 'from-danger-400 to-danger-500';
      heroLabel = `${missedDoses} Missed`;
      heroSub = 'Please check on Margaret';
    } else if (dueDoses > 0) {
      heroColor = 'from-amber-400 to-amber-500';
      heroLabel = `${dueDoses} Overdue`;
      heroSub = 'Doses past their scheduled time';
    } else if (pendingDoses > 0) {
      heroColor = 'from-amber-400 to-amber-500';
      heroLabel = `${pendingDoses} Pending`;
      heroSub = 'Waiting for confirmation';
    } else if (completedDoses === totalDoses) {
      heroColor = 'from-sage-500 to-sage-600';
      heroLabel = 'All Taken ✓';
      heroSub = `${completedDoses} dose${completedDoses !== 1 ? 's' : ''} confirmed today`;
    } else if (upcomingDoses > 0 && completedDoses > 0) {
      heroColor = 'from-sage-500 to-sage-600';
      heroLabel = `${completedDoses}/${totalDoses} Taken`;
      heroSub = `${upcomingDoses} more dose${upcomingDoses !== 1 ? 's' : ''} coming up`;
    } else {
      // All upcoming, none taken yet
      heroColor = 'from-sky-400 to-sky-500';
      heroLabel = `${upcomingDoses} Upcoming`;
      heroSub = `${todayDoses[0]?.timeOfDay ? `Next at ${todayDoses[0].timeOfDay}` : 'Doses scheduled for later'}`;
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
