import React from 'react';

const Login = () => {
    return (
        <div className="container" style={{ paddingTop: '8rem', minHeight: '60vh', textAlign: 'center' }}>
            <h1>Access the Archive</h1>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: '2rem' }}>Only the initiated may pass.</p>

            <form style={{ maxWidth: '400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <input type="email" placeholder="Email" required style={{ padding: '0.75rem', background: '#111', border: '1px solid #333', color: '#fff' }} />
                <input type="password" placeholder="Password" required style={{ padding: '0.75rem', background: '#111', border: '1px solid #333', color: '#fff' }} />
                <button type="submit" className="btn">Log In</button>
            </form>
        </div>
    );
};

export default Login;
