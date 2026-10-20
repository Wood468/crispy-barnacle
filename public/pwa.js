/* Register the offline shell; a failed registration must not block the app. */
(function(){if(!('serviceWorker' in navigator))return;window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){/* The site remains usable without offline support. */});});})();
