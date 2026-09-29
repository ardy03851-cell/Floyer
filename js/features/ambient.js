const STORAGE_KEY = "foyer_ambient3d_enabled";

export function createAmbientController({ container, showToast }) {
  let state = null;
  let scriptPromise = null;

  function isEnabled() {
    return localStorage.getItem(STORAGE_KEY) === "1";
  }

  function setEnabled(enabled) {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
    if (enabled) start();
    else stop();
  }

  function loadThreeJs() {
    if (window.THREE) return Promise.resolve(window.THREE);
    if (scriptPromise) return scriptPromise;

    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
      script.onload = () => resolve(window.THREE);
      script.onerror = () => reject(new Error("Couldn't load 3D engine"));
      document.head.appendChild(script);
    });

    return scriptPromise;
  }

  function getAccent() {
    const styles = getComputedStyle(document.documentElement);
    return {
      vein: styles.getPropertyValue("--vein").trim() || "#8E97A8",
      veinDeep: styles.getPropertyValue("--vein-deep").trim() || "#6F7A8E"
    };
  }

  async function start() {
    if (!container || state) {
      container?.classList.add("active");
      return;
    }

    try {
      const THREE = await loadThreeJs();
      if (!THREE || !container) return;

      const { vein, veinDeep } = getAccent();
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
      camera.position.set(0, 0, 14);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setClearColor(0x000000, 0);
      container.replaceChildren(renderer.domElement);
      container.classList.add("active");

      scene.add(new THREE.AmbientLight(0xffffff, 0.65));

      const keyLight = new THREE.DirectionalLight(new THREE.Color(vein), 0.9);
      keyLight.position.set(4, 6, 8);
      scene.add(keyLight);

      const rimLight = new THREE.DirectionalLight(new THREE.Color(veinDeep), 0.4);
      rimLight.position.set(-6, -3, -4);
      scene.add(rimLight);

      const geometries = [
        new THREE.IcosahedronGeometry(1, 0),
        new THREE.OctahedronGeometry(1, 0),
        new THREE.TorusGeometry(0.7, 0.25, 12, 28),
        new THREE.TetrahedronGeometry(1, 0)
      ];

      const shapes = [];
      for (let i = 0; i < 9; i++) {
        const useAccent = i % 3 === 0;
        const mesh = new THREE.Mesh(
          geometries[i % geometries.length],
          new THREE.MeshStandardMaterial({
            color: new THREE.Color(useAccent ? vein : "#FFFFFF"),
            roughness: 0.55,
            metalness: 0.15,
            transparent: true,
            opacity: useAccent ? 0.5 : 0.85
          })
        );

        mesh.scale.setScalar(0.5 + Math.random() * 0.9);
        mesh.position.set(
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 10 - 4
        );
        mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        mesh.userData.spin = {
          x: (Math.random() - 0.5) * 0.003,
          y: (Math.random() - 0.5) * 0.004,
          z: (Math.random() - 0.5) * 0.002
        };
        mesh.userData.bob = {
          amp: 0.4 + Math.random() * 0.6,
          speed: 0.4 + Math.random() * 0.5,
          offset: Math.random() * Math.PI * 2,
          baseY: mesh.position.y
        };
        scene.add(mesh);
        shapes.push(mesh);
      }

      let frameId = null;
      let mouseX = 0;
      let mouseY = 0;
      const clock = new THREE.Clock();

      const onPointerMove = event => {
        mouseX = (event.clientX / Math.max(window.innerWidth, 1) - 0.5) * 2;
        mouseY = (event.clientY / Math.max(window.innerHeight, 1) - 0.5) * 2;
      };

      const onResize = () => {
        camera.aspect = window.innerWidth / Math.max(window.innerHeight, 1);
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };

      const animate = () => {
        if (!state) return;
        const time = clock.getElapsedTime();
        camera.position.x += (mouseX * 0.45 - camera.position.x) * 0.02;
        camera.position.y += (-mouseY * 0.3 - camera.position.y) * 0.02;
        camera.lookAt(0, 0, 0);

        shapes.forEach(mesh => {
          mesh.rotation.x += mesh.userData.spin.x;
          mesh.rotation.y += mesh.userData.spin.y;
          mesh.rotation.z += mesh.userData.spin.z;
          mesh.position.y = mesh.userData.bob.baseY + Math.sin(time * mesh.userData.bob.speed + mesh.userData.bob.offset) * mesh.userData.bob.amp;
        });

        renderer.render(scene, camera);
        frameId = requestAnimationFrame(animate);
      };

      state = { renderer, scene, shapes, frameId, onPointerMove, onResize };
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("resize", onResize, { passive: true });
      animate();
    } catch (error) {
      console.error(error);
      showToast("Couldn't enable the 3D backdrop");
    }
  }

  function stop() {
    if (!state) {
      container?.classList.remove("active");
      return;
    }

    cancelAnimationFrame(state.frameId);
    window.removeEventListener("pointermove", state.onPointerMove);
    window.removeEventListener("resize", state.onResize);

    state.scene.traverse(object => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach(material => material.dispose?.());
      else object.material?.dispose?.();
    });
    state.renderer.dispose();
    state.renderer.domElement.remove();
    state = null;
    container?.classList.remove("active");
  }

  return { isEnabled, setEnabled, start, stop };
}
