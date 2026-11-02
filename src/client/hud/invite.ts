import { sfx } from '../audio';
import { copyText } from '../ui/clipboard';
import { inviteUrl } from '../lib/code';
import { toast } from '../ui/toast';

export async function copyInvite(code: string): Promise<void> {
  sfx.unlock();
  sfx.click();
  const ok = await copyText(inviteUrl(location.origin, code));
  toast(ok ? 'Link copied. Send it to your crew.' : "Couldn't reach the clipboard. The link is in the address bar.");
}
