// Practice mode, as the HUD shows it: what replaces the invite at a practice
// table, and the quiet offer to an online host who is still drinking alone.
import { makeRoomCode } from '../../protocol';
import { sfx } from '../audio';
import { navigate } from '../app/router';
import { PRACTICE_PATH } from '../net/practice';
import './practice.css';

/** In place of the invite link: nobody else can sit here, so say so. */
export function PracticeNote() {
  return (
    <div className="practice-note">
      <p className="practice-note__line">
        <span className="practice-note__k" aria-hidden="true">
          練習
        </span>
        Practice. Just you and the regulars, in this tab. Learn the nod; no link, no line out.
      </p>
      <button
        type="button"
        className="practice-note__out"
        onClick={() => {
          sfx.click();
          navigate(`/t/${makeRoomCode()}`);
        }}
      >
        Ready for real people? Open a table
      </button>
    </div>
  );
}

/** Online, alone: point at the practice table. A new tab keeps this seat and this link warm. */
export function PracticeOffer() {
  return (
    <p className="practice-offer">
      Quiet in here.{' '}
      <a href={PRACTICE_PATH} target="_blank" rel="noopener" onClick={() => sfx.click()}>
        Warm up with the regulars
      </a>{' '}
      in another tab while the crew finds the door.
    </p>
  );
}
