import React, { useEffect } from 'react';

const Home = () => {
    useEffect(() => {
        // Simple intersection observer to mimic the previous fade-in script
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });

        const elements = document.querySelectorAll('.fade-in, .slide-in');
        elements.forEach(el => observer.observe(el));

        return () => observer.disconnect();
    }, []);

    return (
        <>
            <header className="hero">
                <div className="container">
                    <h1 className="fade-in">HorrorWriter.org</h1>
                    <p className="fade-in delay-1">Where the ambitious convene to craft the next generation of nightmares.</p>
                    <a href="#join" className="btn fade-in delay-2">Enter the Void</a>
                </div>
            </header>

            <section className="mission">
                <div className="container mission-content">
                    <div className="mission-text slide-in">
                        <h2>Our Mission</h2>
                        <p>
                            Horror is more than just scares; it's an art form. We are building a collective of upcoming and ambitious horror novel writers.
                            Together, we critique, collaborate, and conquer the publishing world.
                        </p>
                    </div>
                    <div className="mission-visual slide-in delay-1">
                        <svg width="100%" height="200" viewBox="0 0 400 200" xmlns="http://www.w3.org/2000/svg">
                            <path d="M 50 100 Q 200 50 350 100" stroke="#8a0b0b" strokeWidth="2" fill="none" opacity="0.5" />
                            <path d="M 50 120 Q 200 70 350 120" stroke="#8a0b0b" strokeWidth="2" fill="none" opacity="0.3" />
                        </svg>
                    </div>
                </div>
            </section>

            <section id="join" className="cta">
                <div className="container">
                    <h2 className="fade-in">Join the Collective</h2>
                    <p className="fade-in" style={{ marginBottom: '2rem', color: 'var(--color-text-muted)' }}>
                        We are currently invite-only. Join our waitlist to be summoned.
                    </p>
                    <form className="fade-in delay-1" onSubmit={(e) => { e.preventDefault(); alert('Your soul has been registered.'); }}>
                        <input type="email" placeholder="Enter your email..." required />
                        <button type="submit" className="btn">Summon Me</button>
                    </form>
                </div>
            </section>
        </>
    );
};

export default Home;
