// Connection trouble, in the bartender's voice.
import type { NetStatus, TableStore } from '../net/store';

const ERRORS: Record<NonNullable<TableStore['error']>['code'], string> = {
  full: 'Every stool is taken. Catch them next night.',
  'not-host': "Only the host makes that call.",
  'bad-phase': 'Not now. The cards are out.',
  'bad-message': "The bartender didn't catch that. Try again.",
  rate: 'Easy. One thing at a time.',
  net: 'The line went dead. Check your connection.',
};

export function bartender(error: TableStore['error']): string | null {
  return error ? ERRORS[error.code] ?? error.message : null;
}

export function Banner({ status, error, hasView, onRetry }: { status: NetStatus; error: TableStore['error']; hasView: boolean; onRetry: () => void }) {
  const msg = bartender(error);
  if (hasView && status === 'reconnecting') {
    return (
      <div className="banner" role="status">
        <span className="banner__dot" aria-hidden="true" /> Lost the line. Reconnecting.
      </div>
    );
  }
  if (hasView && status === 'closed') {
    return (
      <div className="banner banner--err" role="alert">
        The line went dead.
        <button type="button" className="banner__btn" onClick={onRetry}>
          Try again
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
