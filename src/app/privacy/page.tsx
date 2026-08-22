import { DataControls } from '@/components/DataControls';
import { getCurrentUserId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const TRACKED = [
  ['Video id, title, channel, length', 'Read from the YouTube player itself, to label your history.'],
  ['Play and pause events', 'With the position in the video, to know when playback ran.'],
  ['Seek events', 'The position you left and the position you landed on, so skipped parts are excluded.'],
  ['Video end', 'To record that you reached the end.'],
  ['Tab visible / hidden', 'So audio playing while you are on another tab is not counted as study time.'],
  ['Session start and end', 'To show how long you spent on this site.'],
];

const NOT_TRACKED = [
  'Your YouTube account, subscriptions, or the history you built on youtube.com',
  'Anything you watch outside this site',
  'Other browser tabs, their URLs, or their contents',
  'Keystrokes, camera, microphone, screen, or location',
  'Any personal data beyond the email address you typed in',
];

export default async function PrivacyPage() {
  let signedIn = false;
  try {
    signedIn = (await getCurrentUserId()) !== null;
  } catch {
    signedIn = false;
  }

  return (
    <div className="measure-wide space-y-8">
      <header className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">Privacy &amp; tracking</h1>
        <p className="text-sm text-dim">
          WatchLens only measures videos you deliberately open on this site. Everything it records
          is listed below — there is no hidden collection.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">What is recorded</h2>
        <ul className="panel divide-y divide-rule">
          {TRACKED.map(([what, why]) => (
            <li key={what} className="px-4 py-3">
              <p className="text-sm font-medium">{what}</p>
              <p className="text-sm text-dim">{why}</p>
            </li>
          ))}
        </ul>
        <p className="text-sm text-dim">
          Events are sent to our server in small batches roughly every ten seconds, plus once when
          you close the page. They are stored in a Postgres database that only this application
          reads.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">What is never recorded</h2>
        <ul className="panel space-y-2 p-4 text-sm text-dim">
          {NOT_TRACKED.map((item) => (
            <li key={item}>— {item}</li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">How video playback works</h2>
        <p className="text-sm text-dim">
          Video is streamed by YouTube straight to your browser through the official embedded
          player. It is never proxied, downloaded, cached or re-served by this application, which
          only ever handles the small JSON events described above. YouTube sets its own cookies and
          applies its own privacy policy to that embed.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Sign-in, honestly</h2>
        <p className="text-sm text-dim">
          Accounts are protected by a password, hashed with scrypt and never stored in readable
          form. Repeated failed sign-ins temporarily lock the account, and the form gives the same
          answer for an unknown address as for a wrong password, so it cannot be used to find out
          who has an account here.
        </p>
        <p className="text-sm text-dim">
          Two things it does not do: email addresses are not verified, and there is no password
          reset — that needs a mail provider this app does not have. If you forget your password,
          delete the account below and sign up again.
        </p>
      </section>

      {signedIn ? (
        <DataControls />
      ) : (
        <p className="panel p-5 text-sm text-dim">Sign in to delete your history or account.</p>
      )}
    </div>
  );
}
