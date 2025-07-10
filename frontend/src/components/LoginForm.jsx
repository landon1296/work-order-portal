import React, { useState } from 'react';
import API from '../api';
import { jwtDecode} from 'jwt-decode'; // <-- 1. import
import logo from '../assets/GLLSLogo.png'; // <-- 2. import your logo!
import { useNavigate } from 'react-router-dom';

export default function LoginForm({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async e => {
    e.preventDefault();
    console.log("submitting form!");
    try {
      const { data } = await API.post('/login', { username, password });
      const userInfo = jwtDecode(data.token); // <-- 2. decode the token!
      onLogin({ token: data.token, ...userInfo }); // <-- 3. pass user object
      if (userInfo.role === 'analytics' || userInfo.role === 'owner') {
        navigate('/analytics');
      } else if (userInfo.role === 'manager') {
        navigate('/dashboard');
      } else {
        navigate('/tech-dashboard');
      }

      

    } catch {
      alert('Login failed');
    }
  };

return (
  <div
    style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f7f7fa'
    }}
  >
    <form
      onSubmit={handleSubmit}
      className='max-w-sm w-full p-4'
      style={{
        maxWidth: 440,
        width: '100%',
        padding: 40,
        background: '#fff',
        borderRadius: 24,
        boxShadow: '0 4px 24px rgba(0,0,0,0.50)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}
    >
      <img
        src={logo}
        alt="GLLS Company Logo"
        style={{
          width: 260,
          marginBottom: 24
        }}
      />
      <h2 className='=text-x1 mb-4' style={{ textAlign: 'center', width: '100%'}}> Great Lakes Lifting Work Order Portal</h2>
      <h3 className='text-xl mb-4' style={{ textAlign: 'center', width: '100%' }}>Login</h3>
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
);

}
