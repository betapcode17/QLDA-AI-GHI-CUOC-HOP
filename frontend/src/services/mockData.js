export const mockMeetings = [
  {
    id: 'mtg-001',
    title: 'Product roadmap sync',
    date: '2026-04-28T09:30:00Z',
    duration: '42 min',
    status: 'Summarized',
    speakers: 4,
    source: 'Zoom',
    sentiment: 'Focused',
    transcript: [
      { speaker: 'Ava', time: '00:12', text: 'Let us align on the Q3 roadmap and the release dependencies.' },
      { speaker: 'Marcus', time: '02:05', text: 'The desktop beta is on track, but onboarding still needs instrumentation.' },
      { speaker: 'Jules', time: '11:48', text: 'We should prioritize meeting summaries and searchable history for the launch.' },
      { speaker: 'Ava', time: '24:10', text: 'Agreed. Let us freeze non-critical scope and focus on reliability.' }
    ],
    summary: {
      overview: 'The team aligned on a Q3 roadmap focused on shipping the desktop beta, improving onboarding analytics, and prioritizing meeting summaries plus searchable history.',
      decisions: [
        'Freeze non-critical scope until the desktop beta stabilizes.',
        'Prioritize searchable meeting history for launch readiness.',
        'Add instrumentation for onboarding drop-off analysis.'
      ],
      actionItems: [
        'Marcus to ship onboarding metrics by Friday.',
        'Jules to refine the summary UX for transcript review.',
        'Ava to publish the roadmap update to stakeholders.'
      ]
    }
  },
  {
    id: 'mtg-002',
    title: 'Customer research debrief',
    date: '2026-04-27T14:00:00Z',
    duration: '31 min',
    status: 'Transcribed',
    speakers: 3,
    source: 'Google Meet',
    sentiment: 'Constructive',
    transcript: [
      { speaker: 'Nina', time: '00:21', text: 'Users like the local-first story but want faster note export.' },
      { speaker: 'Leo', time: '08:42', text: 'Meeting history is valuable only if search is instant and reliable.' },
      { speaker: 'Nina', time: '18:13', text: 'Privacy is a strong differentiator. We should make that clearer in onboarding.' }
    ],
    summary: {
      overview: 'Research participants responded well to privacy-first messaging and local processing, but they need faster export flows and better search confidence.',
      decisions: [
        'Move export access higher in the meeting detail UI.',
        'Highlight privacy and local processing during onboarding.'
      ],
      actionItems: [
        'Design team to prototype export placement changes.',
        'Growth team to update onboarding copy.'
      ]
    }
  },
  {
    id: 'mtg-003',
    title: 'Weekly engineering standup',
    date: '2026-04-26T07:45:00Z',
    duration: '18 min',
    status: 'Recording Ready',
    speakers: 5,
    source: 'Teams',
    sentiment: 'Fast-paced',
    transcript: [
      { speaker: 'Sara', time: '01:05', text: 'Audio capture is stable, but we need better device selection defaults.' },
      { speaker: 'Dev', time: '06:28', text: 'The Tauri bridge is fine; the settings screen needs clearer model status.' }
    ],
    summary: {
      overview: 'Engineering reviewed capture stability and flagged settings clarity plus better default device selection as the next UX improvements.',
      decisions: [
        'Expose microphone and system source defaults in settings.'
      ],
      actionItems: [
        'Frontend to improve model health visibility.',
        'Desktop team to revisit input source defaults.'
      ]
    }
  }
];

export const mockSettings = {
  workspaceName: 'Meetily Workspace',
  apiBaseUrl: 'http://localhost:8000',
  transcriptionModel: 'Parakeet',
  summaryMode: 'Local Ollama',
  autoSave: true
};
