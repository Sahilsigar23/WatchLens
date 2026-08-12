import { redirect } from 'next/navigation';

/** `/watch` is an alias for the landing page, which is the watch surface. */
export default function WatchAlias() {
  redirect('/');
}
