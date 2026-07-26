const themes = {
  romantico: {
    id: 'romantico',
    label: 'Romántico Clásico',
    description: 'Tipografía serif elegante, paleta blush & dorado, animaciones suaves.',
    css: '/css/theme-romantico.css',
    swatch: ['#f7e9e3', '#c99383', '#8a5a44'],
    ambient: { shape: 'circle', colors: ['#e9c3ae', '#c99383', '#fff3ea'], count: 20, minSize: 24, maxSize: 60, speed: 0.1 },
    cursorColor: 'rgba(138,90,68,0.45)',
  },
  moderno: {
    id: 'moderno',
    label: 'Moderno Minimalista',
    description: 'Blanco y negro, tipografía sans-serif fuerte, transiciones geométricas.',
    css: '/css/theme-moderno.css',
    swatch: ['#111111', '#f4f4f4', '#c9a227'],
    ambient: { shape: 'shard', colors: ['#c9a227', '#f4f4f4'], count: 24, minSize: 30, maxSize: 70, speed: 0.16 },
    cursorColor: 'rgba(201,162,39,0.55)',
  },
  boho: {
    id: 'boho',
    label: 'Boho Natural',
    description: 'Tonos tierra, texturas orgánicas, animaciones cálidas tipo acuarela.',
    css: '/css/theme-boho.css',
    swatch: ['#efe5d8', '#a9784e', '#5c6b47'],
    ambient: { shape: 'petal', colors: ['#a9784e', '#5c6b47', '#d8c3a0'], count: 16, minSize: 16, maxSize: 30, speed: 0.09 },
    cursorColor: 'rgba(92,107,71,0.5)',
  },
};

module.exports = themes;
