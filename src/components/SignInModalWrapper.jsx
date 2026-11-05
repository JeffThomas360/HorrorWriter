import { useState, useEffect } from 'react';
import SignInModal from './SignInModal.jsx';

// `open-signin` opens the sign-in screen; `{ detail: { mode: 'signup' } }` opens Join.
const modeOf = (requested) => (requested === 'signup' ? 'signup' : 'signin');

export default function SignInModalWrapper() {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState('signin');

  useEffect(() => {
    const handleOpen = (e) => {
      setMode(modeOf(e?.detail?.mode));
      setIsOpen(true);
    };
    window.addEventListener('open-signin', handleOpen);
    // Replay a request that arrived before this island hydrated. The dispatcher
    // (UserMenu / RequireAuth / page scripts) and this modal are independent
    // islands that hydrate in an unguaranteed order; MainLayout's early inline
    // listener records the request (and which screen) on `window.__signinPending`
    // so it survives the gap instead of being lost as a transient event.
    if (window.__signinPending) {
      setMode(modeOf(window.__signinPending));
      setIsOpen(true);
    }
    return () => window.removeEventListener('open-signin', handleOpen);
  }, []);

  const handleClose = () => {
    window.__signinPending = false;
    setIsOpen(false);
  };

  return <SignInModal isOpen={isOpen} onClose={handleClose} initialMode={mode} />;
}
