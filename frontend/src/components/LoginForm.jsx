import React, { useState } from 'react';
import API from '../api';
import { jwtDecode} from 'jwt-decode'; // <-- 1. import
import logo from '../assets/GLLSLogo.png'; // <-- 2. import your logo!
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
// import LoadingSpinner from './LoadingSpinner'; // No longer needed

// DISABLED: 3D animation causing screen flickering issues
// const SpinningLogoGlobe = lazy(() => import('./SpinningLogoGlobe'));










export default function LoginForm({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();
  useCursorGlow();

  const handleSubmit = async e => {
    e.preventDefault();
    console.log("submitting form!");
    try {
      const { data } = await API.post('/login', { username, password });
      const userInfo = jwtDecode(data.token); // <-- decode the token!
      
      // Include roles and primaryRole from backend response
      const userWithRoles = { 
        token: data.token, 
        ...userInfo,
        roles: data.roles || [data.role], // Use roles array from backend or fallback to single role
        primaryRole: data.primaryRole || data.role
      };
      
      onLogin(userWithRoles);
      
      // Route based on primary role
      const primaryRole = userWithRoles.primaryRole || userWithRoles.role;
      if (primaryRole === 'analytics' || primaryRole === 'owner') {
        navigate('/dashboard');
      } else if (primaryRole === 'manager') {
        navigate('/dashboard');
      } else {
        navigate('/tech-dashboard');
      }



    } catch {
      alert('Login failed');
    }
  };


  function useCursorGlow() {
    useEffect(() => {
      const glow = document.createElement('div');
      glow.style.position = 'fixed';
      glow.style.top = 0;
      glow.style.left = 0;
      glow.style.width = '200px';
      glow.style.height = '200px';
      glow.style.borderRadius = '100%';
      glow.style.background = 'radial-gradient(circle, rgba(255,0,0,.5), transparent 50%)';
      glow.style.pointerEvents = 'none';
      glow.style.zIndex = 1;
      glow.style.filter = 'blur(30px)';
      glow.style.transition = 'transform 0.1s ease-out';
      document.body.appendChild(glow);
  
      const handleMouseMove = (e) => {
        glow.style.transform = `translate(${e.clientX - 100}px, ${e.clientY - 100}px)`;
      };
  
      window.addEventListener('mousemove', handleMouseMove);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        document.body.removeChild(glow);
      };
    }, []);
  }

  //const [vantaEffect, setVantaEffect] = useState(null);
  //const vantaRef = useRef(null);
  
 /* useEffect(() => {
    if (!vantaEffect) {
      setVantaEffect(
        GLOBE({
          el: vantaRef.current,
          THREE,
          mouseControls: true,
          touchControls: true,
          minHeight: 200.0,
          minWidth: 200.0,
          scale: 1.0,
          scaleMobile: 1.0,
          color: 0xff0000,           // 💥 glowing dot/line color
          backgroundColor: 0x000000, // 🧱 dark background
          size: .75,                 // 🌀 spacing between points
        })
      );
    } */

  
    
  

  
  
return (
  <>
  {/* Simple static background instead of 3D animation */}
  <div style={{
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    background: 'linear-gradient(135deg, #000000 0%, #1a1a1a 50%, #000000 100%)',
    zIndex: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  }}>
    <img
      src="/logo192.png"
      alt="GLLS Logo"
      style={{
        width: '200px',
        height: '200px',
        opacity: 0.2,
        filter: 'blur(1px)'
      }}
    />
  </div>
 


  <div className='max-w-sm w-full p-4'
    style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 4px 24px rgba(0,0,0,1.9)',
      position: 'relative',
      zIndex:1,
    }}
  >
    <form
      onSubmit={handleSubmit}
      
      style={{
        
        maxWidth: 500,
        width: '100%',
        paddingTop: 0,
        padding:40,
        paddingBottom: 40,
        backgroundColor: 'rgba(255,255,255,0.08)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 24,
        boxShadow: '0 0 25px rgba(255, 0, 0, 1), 0 0 50px rgba(255, 0, 0, 1)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        fontFamily: 'Arial, sans-serif',
        position: 'relative',
        zIndex:2
      }} 
    >
      <img
          src={logo}
          alt="GLLS Company Logo"
          className="login-logo"


      />
      <h2 className="login-header" style={{ textAlign: 'center', width: '100%', fontFamily: 'Ariel, sans-serif', color: '#ff0000'}}> Great Lakes Lifting Work Order Portal</h2>
      <h3 className='text-xl mb-4' style={{ textAlign: 'center', width: '100%', fontFamily: 'Ariel, sans-serif', color: '#ff0000' }}>Login</h3>
      <input
        name="username"
        autoComplete="username"
        value={username}
        onChange={e=>setUsername(e.target.value)}
        placeholder='Username'
        className='w-full mb-2 p-2 border'
        style={{ 
          fontSize: 18,
          padding: '14px 12px',
          marginBottom: 16,
          width: '100%',
          border: '1px solid #ccc',
          borderRadius: 12
           }}
      />
      <input
        type='password'
        name="password"
        autoComplete="current-password"
        value={password}
        onChange={e=>setPassword(e.target.value)}
        placeholder='Password'
        className='w-full mb-4 p-2 border'
        style={{ fontSize: 18,
          padding: '14px 12px',
          marginBottom: 16,
          width: '100%',
          border: '1px solid #ccc',
          borderRadius: 12 }}
      />
      <button
        type='submit'
        className='w-full p-2 rounded bg-blue-500 text-white'
        style={{ fontSize: 18,
        padding: '14px 0',
        width: '100%',
        fontWeight: 'bold',
        background: '#3b82f6',
        color: 'white',
        border: 'none',
        borderRadius: 24,
        cursor: 'pointer' }}
      >
        Sign In
      </button>
    </form>
  </div>

  </>
);

}
