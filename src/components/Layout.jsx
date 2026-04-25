import React from 'react';
import { Outlet, Link } from 'react-router-dom';

const Layout = () => {
    return (
        <div className="layout-wrapper">
            {/* We can add a proper Navbar here later, for now we keep the landing page feel */}
            <Outlet />

            <footer>
                <div className="container">
                    <p>&copy; 2026 HorrorWriter.org. All rights reserved.</p>
                    <div style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
                        <Link to="/login">Login</Link> | <Link to="/">Home</Link>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default Layout;
