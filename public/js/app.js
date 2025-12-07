// Nexus Framework - Sample JavaScript

console.log('🚀 Nexus Framework - Static files loaded!');

document.addEventListener('DOMContentLoaded', () => {
    console.log('Page ready!');
    
    // Add some interactivity
    const features = document.querySelectorAll('.feature');
    features.forEach((feature, index) => {
        feature.style.animationDelay = `${index * 0.1}s`;
        feature.classList.add('fade-in');
    });
});

// Add fade-in animation
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
    }
    .fade-in {
        animation: fadeIn 0.5s ease forwards;
    }
`;
document.head.appendChild(style);
