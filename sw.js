self.importScripts('js/idb.js');

const staticCacheName = 'restaurant-static-v4';
const databaseName = 'restaurants'
const storeName = 'restaurants-store';

const dbPromise = idb.open(databaseName, 1, upgradeDB => {
  upgradeDB.createObjectStore(storeName, {
    keyPath: 'id'
  });
});

/**
Cache all files when new Service Worker is installed
*/
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(staticCacheName).then(function(cache) {
      return cache.addAll([
          '/',
          '/index.html',
          '/restaurant.html',
          '/css/styles.css',
          '/js/dbhelper.js',
          '/js/main.js',
          '/js/restaurant_info.js'
      ]);
    })
  );
});

/**
Delete old caches when new Service Worker is being activated
*/
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.filter(function(cacheName) {
          return cacheName.startsWith('restaurant-') &&
                 cacheName !== staticCacheName;
        }).map(function(cacheName) {
          return caches.delete(cacheName);
        })
      );
    })
  );
});

/**
Fetch files from cache if available, else request file from server
*/
self.addEventListener('fetch', function(event) {
  let request = event.request;
  let requestUrl = new URL(event.request.url);
  if (requestUrl.port !== '1337') {
    // Request is not going to our API, thus no need for indexDB
    event.respondWith(caches.match(request, {ignoreSearch: true}).then(response => {
      return (response || fetch(event.request).then(fetchResponse => {
        return caches
          .open(staticCacheName)
          .then(cache => {
            if (fetchResponse.url.indexOf("browser-sync") === -1) {
              cache.put(event.request, fetchResponse.clone());
            }
            return fetchResponse;
          });
      }).catch(error => {
        console.log(error)
        return new Response("Application is not connected to the internet", {
          status: 404,
          statusText: "Application is not connected to the internet"
        });
      }));
    }));
  } else {
    // Request goes to Port 1337 
    event.respondWith(dbPromise.then(db => {
      var tx = db.transaction(storeName, 'readonly');
      var store = tx.objectStore(storeName);
      return store.getAll();
    }).then(data => {
      if (data.length > 0) {
        return data 
      }
      fetch(event.request)
        .then(fetchResponse => fetchResponse.json())
        .then(json => {
          console.log('Fetched restaurant JSON from API.')
          const restaurants = json;
          dbPromise.then((db) => {
            var tx = db.transaction(storeName, 'readwrite');
            var store = tx.objectStore(storeName);
            restaurants.forEach(restaurant => {
              store.put(restaurant);
            })
            console.log('Put restaurant objects into inedxDB.')
          })
          return restaurants
        })
    }).then(finalResponse => {
      return new Response(JSON.stringify(finalResponse));
    }).catch(error => {
      return new Response("Error fetching data", {status: 500});
    }));
  }
});
