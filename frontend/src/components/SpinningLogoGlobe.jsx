import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

export default function SpinningLogoGlobe() {
  const mountRef = useRef(null);

  useEffect(() => {
    // Scene setup
    const scene = new THREE.Scene();
    const aspect = window.innerWidth / window.innerHeight;
    const frustumSize = 5;
    
    const camera = new THREE.OrthographicCamera(
      (frustumSize * aspect) / -2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      frustumSize / -2,
      0.1,
      1000
    );
    camera.position.set(0, 0,10);
    camera.lookAt(0, 0, 0);
    
    
    
    
    


    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio); // crisp rendering
    renderer.setSize(window.innerWidth, window.innerHeight);

    const handleResize = () => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
      };
      
      
    handleResize(); // run once now
    window.addEventListener('resize', handleResize);
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;


    let lastMouseMove = Date.now();
    let idleAngle = 0;

    
    document.addEventListener('mousemove', (e) => {
        const x = (e.clientX / window.innerWidth) * 2 - 1;
        const y = -(e.clientY / window.innerHeight) * 2 + 1;
        targetX = x;
        targetY = y;
        document.addEventListener('mousemove', (e) => {
            const x = (e.clientX / window.innerWidth) * 2 - 1;
            const y = -(e.clientY / window.innerHeight) * 2 + 1;
          
            targetX = x;
            targetY = y;
          
            if (Date.now() - lastMouseMove > 100) {
              targetX = currentX;
              targetY = currentY;
            }
          
            lastMouseMove = Date.now();
          });
          
        lastMouseMove = Date.now();
      });
      
    

    mountRef.current.appendChild(renderer.domElement);

    // Globe geometry (wireframe sphere)
    const globeGeometry = new THREE.SphereGeometry(1.3, 15, 15);
    const globeMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      wireframe: true,
    });
    const globe = new THREE.Mesh(globeGeometry, globeMaterial);
    globe.position.set(2.9, 1, 0); // ⬅ shift right and up

    scene.add(globe);

    // Dots and lines (full background)
const dotGroup = new THREE.Group();
const dotMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });

const dotCount = 150;
const spread = 12;
const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, opacity: .5, transparent: true });
const dots = [];

for (let i = 0; i < dotCount; i++) {
  const x = (Math.random() - 0.5) * spread;
  const y = (Math.random() - 0.5) * spread;
  const z = (Math.random() - 0.5) * spread;

  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.025, 15, 15), dotMaterial);
  dot.position.set(x, y, z);
  dotGroup.add(dot);
  dots.push(dot);
}

// Connect nearby dots with lines
for (let i = 0; i < dots.length; i++) {
  for (let j = i + 1; j < dots.length; j++) {
    const dist = dots[i].position.distanceTo(dots[j].position);
    if (dist < 2.5) {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        dots[i].position,
        dots[j].position,
      ]);
      const line = new THREE.Line(geometry, lineMaterial);
      dotGroup.add(line);
    }
  }
}

scene.add(dotGroup);


    // Lighting to make the logo look 3D
    const light = new THREE.PointLight(0xffffff, 1);
    light.position.set(2, 2, 5);
    scene.add(light);

    // Load logo texture
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load('/logo192.png', (texture) => {
        const logoGeometry = new THREE.PlaneGeometry(2.5, 2.5);
        const logoMaterial = new THREE.MeshBasicMaterial({
          map: texture,
          opacity: 1.0,
          transparent: true,
          side: THREE.DoubleSide,
          color: new THREE.Color(0xff0000), // red tint
          metalness: 1,
        
          
        });

        
        const logoPlane = new THREE.Mesh(logoGeometry, logoMaterial);
        logoPlane.position.set(0, 0, 0); // center
        globe.add(logoPlane);
        

    });

    // Animate
    const animate = () => {
        requestAnimationFrame(animate);
      
        const now = Date.now();
        const idleTime = now - lastMouseMove;
      
        if (idleTime > 100) {
          // Generate idle target
          idleAngle += 0.009;
          const idleTargetX = Math.sin(idleAngle * 0.5) * 0.5;
          const idleTargetY = Math.cos(idleAngle * 0.5) * 0.5;
      
          // EASE targetX/Y toward idle — not jump
          targetX += (idleTargetX - targetX) * 0.01;
          targetY += (idleTargetY - targetY) * 0.01;
        }
      
        // Continue easing current toward target
        currentX += (targetX - currentX) * 0.05;
        currentY += (targetY - currentY) * 0.05;
      
        scene.rotation.y = currentX * 0.5;
        scene.rotation.x = currentY * 0.5;
      
        globe.rotation.y += 0.005;
      
        renderer.render(scene, camera);
      };
      
    animate();

    // Cleanup
    return () => {
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
        window.removeEventListener('resize', handleResize);
      }
      renderer.dispose();
    };
  }, []);

  return (
<div
  ref={mountRef}
  style={{
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    zIndex: 0,
    overflow: 'hidden',
  }}
/>

  );
  
}
