// Revelado al hacer scroll
document.querySelectorAll('.reveal').forEach(el => {
  const io = new IntersectionObserver((entries, obs) => {
    if (entries[0].isIntersecting) {
      el.classList.add('visible');
      obs.disconnect();
    }
  }, { threshold: 0.2 });
  io.observe(el);
});

// Filtrado de cronología
document.getElementById('filterSelect').addEventListener('change', e => {
  const val = e.target.value;
  document.querySelectorAll('#timeline tbody tr').forEach(row => {
    const res = row.cells[2].textContent.trim();
    row.style.display = (val === 'all' || res === val) ? '' : 'none';
  });
});

// Pestañas de hándicaps
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.add('hidden'));
    document.getElementById(btn.dataset.team).classList.remove('hidden');
  });
});


// script.js
const revealElements = document.querySelectorAll('.reveal');

const revealObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      // observer.unobserve(entry.target); // Opcional: dejar de observar una vez revelado
    }
    // Opcional: para que se oculte de nuevo si se scrollea hacia arriba
    // else {
    //   entry.target.classList.remove('visible');
    // }
  });
}, {
  root: null, // viewport
  threshold: 0.1 // 10% del elemento visible
});

revealElements.forEach(el => {
  revealObserver.observe(el);
});


window.addEventListener('scroll', () => {
  const nav = document.querySelector('.site-nav');
  if (window.scrollY > 50) {
    nav.classList.remove('transparent');
  } else {
    nav.classList.add('transparent');
  }
});

// Inicializa en carga
document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector('.site-nav');
  if (window.scrollY === 0) nav.classList.add('transparent');
});
