// Connection trouble, in the Master's voice. He talks the way he pours: short.
import type { NetStatus, TableStore } from '../net/store';

const ERRORS: Record<NonNullable<TableStore['error']>['code'], string> = {
  full: 'Every stool is taken. The Master says come back next night.',
  'not-host': "Only the host makes that call.",
  'bad-phase': 'Not now. The cards are out.',
  'bad-message': "The Master didn't catch that. Say it again.",
  rate: 'Easy. One thing at a time.',
  net: 'The line went dead. Check your connection. The Master will wait.',
};

export function bartender(error: TableStore['error']): string | null {
  return error ? ERRORS[error.code] ?? error.message : null;
}

export function Banner({ status, error, hasView, onRetry }: { status: NetStatus; error: TableStore['error']; hasView: boolean; onRetry: () => void }) {
  const msg = bartender(error);
  if (hasView && status === 'reconnecting') {
    return (
      <div className="banner" role="status">
        <span className="banner__dot" aria-hidden="true" /> Lost the line. The Master is knocking again.
      </div>
    );
  }
  if (hasView && status === 'closed') {
    return (
      <div className="banner banner--err" role="alert">
        The line went dead. Your stool is still here.
        <button type="button" className="banner__btn" onClick={onRetry}>
          Knock again
        </button>
      </div>
    );
  }
  if (hasView && msg) {
    return (
      <div className="banner banner--err" role="alert">
        {msg}
      </div>
    );
  }
  return null;
}
