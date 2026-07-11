import React, { useState } from 'react';
import { Joyride } from 'react-joyride';

const tourSteps = [
  {
    target: '.incident-list',
    content: 'This is your incident list. Incidents are grouped by urgency - critical items appear first.',
    disableBeacon: true
  },
  {
    target: '.incident-card',
    content: 'Each card shows the incident ID, affected system, and threat score. Click to view details.',
    disableBeacon: true
  },
  {
    target: '.threat-intel-panel',
    content: 'This panel shows threat intelligence from multiple sources including VirusTotal and AbuseIPDB.',
    disableBeacon: true
  },
  {
    target: '.workflow-pipeline',
    content: 'This shows the automated response pipeline. Each step runs automatically unless human approval is needed.',
    disableBeacon: true
  },
  {
    target: '.approve-button',
    content: 'When human approval is needed, click here to approve the recommended action.',
    disableBeacon: true
  }
];

export function OnboardingTour() {
  const [runTour, setRunTour] = useState(() => !localStorage.getItem('tourCompleted'));

  const handleJoyrideCallback = (data) => {
    if (data.status === 'finished' || data.status === 'skipped') {
      localStorage.setItem('tourCompleted', 'true');
      setRunTour(false);
    }
  };

  return (
    <Joyride
      steps={tourSteps}
      run={runTour}
      continuous
      showSkipButton
      showProgress
      callback={handleJoyrideCallback}
      styles={{
        options: {
          zIndex: 10000,
          primaryColor: '#6366f1'
        }
      }}
    />
  );
}
