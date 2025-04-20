document.addEventListener("DOMContentLoaded", function() {
    setTimeout(function() {
        let particlesDiv = document.getElementById("particles-js");
        if (!particlesDiv) {
            console.error("⚠️ Element #particles-js not found!");
            return;
        }
        
        if (typeof particlesJS !== "undefined") {
            particlesJS("particles-js", {
                particles: {
                    number: { value: 10, density: { enable: true, value_area: 70 }},
                    color: { value: '#ff0000' },
                    shape: { type: 'circle' },
                    opacity: { value: 1, random: true },
                    size: { value: 3, random: true },
                    line_linked: { enable: true, distance: 150, color: '#ffffff', opacity: 0.4, width: 0.9 },
                    move: { enable: true, speed: 0.2 }
                },
                interactivity: {
                    events: {
                        onhover: { enable: false , mode: 'repulse' },  
                        onclick: { enable: false }
                    },
                    modes: {
                        repulse: { distance: 50, duration: 0.2}, 
                    }
                },
                retina_detect: true
            });
        } else {
            console.error("particlesJS is not defined!");
        }
    }, 500);
});
