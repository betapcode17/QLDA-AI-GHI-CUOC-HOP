import { z } from 'zod';

const id = z.string().uuid();
const optionalDate = z.string().datetime().optional().nullable();

export const authSchemas = {
  register: z.object({ body: z.object({ username: z.string().min(3), password: z.string().min(8), fullName: z.string().min(1), email: z.string().email(), role: z.enum(['Admin', 'Manager', 'Member']).optional() }) }),
  login: z.object({ body: z.object({ login: z.string().min(1), password: z.string().min(1) }) }),
  refresh: z.object({ body: z.object({ refreshToken: z.string().min(1) }) }),
  changePassword: z.object({ body: z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) }) }),
  resetPassword: z.object({ body: z.object({ email: z.string().email(), newPassword: z.string().min(8) }) })
};

export const userSchemas = {
  create: z.object({ body: z.object({ username: z.string().min(3), password: z.string().min(8), fullName: z.string().min(1), email: z.string().email(), role: z.enum(['Admin', 'Manager', 'Member']).default('Member') }) }),
  update: z.object({ params: z.object({ id }), body: z.object({ username: z.string().min(3).optional(), password: z.string().min(8).optional(), fullName: z.string().min(1).optional(), email: z.string().email().optional(), role: z.enum(['Admin', 'Manager', 'Member']).optional() }) }),
  role: z.object({ params: z.object({ id }), body: z.object({ role: z.enum(['Admin', 'Manager', 'Member']) }) })
};

export const meetingSchemas = {
  create: z.object({ body: z.object({ title: z.string().min(1), description: z.string().optional(), startTime: optionalDate, endTime: optionalDate, passcode: z.string().optional(), status: z.enum(['Scheduled', 'InProgress', 'Completed', 'Archived']).optional(), folderId: z.string().optional() }) }),
  update: z.object({ params: z.object({ id }), body: z.object({ title: z.string().min(1).optional(), description: z.string().nullable().optional(), startTime: optionalDate, endTime: optionalDate, passcode: z.string().nullable().optional(), status: z.enum(['Scheduled', 'InProgress', 'Completed', 'Archived']).optional(), folderId: z.string().nullable().optional() }) }),
  status: z.object({ params: z.object({ id }), body: z.object({ status: z.enum(['Scheduled', 'InProgress', 'Completed', 'Archived']) }) })
};

export const participantSchemas = {
  add: z.object({ params: z.object({ meetingId: id }), body: z.object({ userId: id, meetingRole: z.enum(['Host', 'CoHost', 'Participant']).default('Participant') }) }),
  role: z.object({ params: z.object({ meetingId: id, userId: id }), body: z.object({ meetingRole: z.enum(['Host', 'CoHost', 'Participant']) }) })
};

export const speakerSchemas = {
  create: z.object({ params: z.object({ meetingId: id }), body: z.object({ speakerLabel: z.string().min(1), realName: z.string().optional(), colorHex: z.string().optional() }) }),
  rename: z.object({ params: z.object({ id }), body: z.object({ speakerLabel: z.string().min(1).optional(), realName: z.string().nullable().optional(), colorHex: z.string().nullable().optional() }) }),
  merge: z.object({ body: z.object({ sourceSpeakerId: id, targetSpeakerId: id }) })
};

export const transcriptSchemas = {
  create: z.object({ params: z.object({ meetingId: id }), body: z.object({ speakerId: id.optional(), startTimestamp: z.number().optional(), endTimestamp: z.number().optional(), originalText: z.string().min(1), translatedText: z.string().optional(), sentimentLabel: z.enum(['Positive', 'Neutral', 'Negative']).optional(), behaviorLabel: z.enum(['Agreement', 'Disagreement', 'Suggestion', 'Question', 'Decision', 'Action']).optional(), isHighlighted: z.boolean().optional() }) }),
  update: z.object({ params: z.object({ id }), body: z.object({ speakerId: id.nullable().optional(), startTimestamp: z.number().optional(), endTimestamp: z.number().optional(), originalText: z.string().min(1).optional(), translatedText: z.string().nullable().optional(), sentimentLabel: z.enum(['Positive', 'Neutral', 'Negative']).nullable().optional(), behaviorLabel: z.enum(['Agreement', 'Disagreement', 'Suggestion', 'Question', 'Decision', 'Action']).nullable().optional(), isHighlighted: z.boolean().optional() }) }),
  highlight: z.object({ params: z.object({ id }), body: z.object({ isHighlighted: z.boolean().default(true) }) })
};

export const summarySchemas = {
  create: z.object({ params: z.object({ meetingId: id }), body: z.object({ summaryType: z.enum(['Executive', 'Detailed', 'ActionItems', 'KeyDecisions']), content: z.string().min(1) }) }),
  update: z.object({ params: z.object({ id }), body: z.object({ content: z.string().min(1) }) })
};

export const actionSchemas = {
  create: z.object({ params: z.object({ meetingId: id }), body: z.object({ taskContent: z.string().min(1), assigneeName: z.string().optional(), deadline: optionalDate, priority: z.enum(['Low', 'Medium', 'High', 'Critical']).default('Medium'), status: z.enum(['Todo', 'InProgress', 'Done']).default('Todo'), sourceTranscriptId: id.optional() }) }),
  update: z.object({ params: z.object({ id }), body: z.object({ taskContent: z.string().min(1).optional(), assigneeName: z.string().nullable().optional(), deadline: optionalDate, priority: z.enum(['Low', 'Medium', 'High', 'Critical']).optional(), status: z.enum(['Todo', 'InProgress', 'Done']).optional(), sourceTranscriptId: id.nullable().optional() }) })
};

export const noteSchemas = {
  add: z.object({ body: z.object({ meetingId: id, transcriptId: id.optional(), noteContent: z.string().optional(), isBookmark: z.boolean().default(true) }) }),
  update: z.object({ params: z.object({ id }), body: z.object({ noteContent: z.string().nullable().optional(), isBookmark: z.boolean().optional() }) })
};
