export interface Session {
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  userId?: string;
  userName?: string;
  userEmail?: string;
}

export function getSessionDuration(session: Session): number | undefined {
  if (!session.endTime) return undefined;
  return Math.floor(
    (session.endTime.getTime() - session.startTime.getTime()) / 1000
  );
}

export function isSessionActive(session: Session): boolean {
  return session.endTime === undefined;
}

export function sessionToJson(session: Session): Record<string, unknown> {
  return {
    sessionId: session.sessionId,
    startTime: session.startTime.toISOString(),
    endTime: session.endTime?.toISOString(),
    userId: session.userId,
    userName: session.userName,
    userEmail: session.userEmail,
    duration: getSessionDuration(session),
  };
}
