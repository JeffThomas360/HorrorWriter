import { useState, useEffect } from 'react';
import SignInModal from './SignInModal.jsx';

export default function SignInModalWrapper() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    window.addEventListener('open-signin', handleOpen);
    return () => window.removeEventListener('open-signin', handleOpen);
  }, []);

  return <SignInModal isOpen={isOpen} onClose={() => setIsOpen(false)} />;
}
