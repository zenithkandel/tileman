importScripts('https://storage.googleapis.com/workbox-cdn/releases/5.0.0/workbox-sw.js');

if (workbox)
	console.log(`Yay! Workbox is loaded 🎉`);
else
	console.log(`Boo! Workbox didn't load 😬`);
workbox.setConfig({ debug: false });

//fuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuck workbox
//fuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuck workbox
//fuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuck workbox
//fuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuck workbox
//fuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuck workbox
//fuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuck workbox
//workbox Unable to ensure service worker stays alive when updating cache for '/'. whaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaat?????????????????????

workbox.loadModule('workbox-strategies');
workbox.loadModule('workbox-broadcast-update');
const strategies = workbox.strategies;
const broadcastUpdate = workbox.broadcastUpdate;
const expiration = workbox.expiration;
const routing = workbox.routing;

self.addEventListener('install', function (event) {
	self.skipWaiting();
});

workbox.precaching.precacheAndRoute([
	{ url: '/favicon-off.png', revision: null }
]);

const indexHandler = async (args) => {
	//	console.log(args,"args");
	//	args.request.url=args.request.url.split("?")[0];
	//	args.url.href=args.url.href.split("?")[0];
	try {
		const response = await new strategies.NetworkFirst({
			cacheName: 'pages',
			plugins: [
				new broadcastUpdate.BroadcastUpdatePlugin({
					channelName: 'index-update',
				})
			],
			matchOptions: { ignoreSearch: true },//funguje čiastočne
			ignoreURLParametersMatching: [/.*/],
			ignoreUrlParametersMatching: [/.*/] //fucking workbox ignore ignoring
		}).handle(args);
		//console.log(0,response,0)
		if (response.status < 400)//<400
			return response;
		const ch = await caches.match(args.request.url);
		if (ch)
			return ch;
		else return response;
	} catch (error) {
		return await caches.match(args.request.url);
	}
};

const hraHandler = async (args) => {
	//	console.log(args,8)
	try {
		const response = await new strategies.NetworkFirst({
			cacheName: 'scripts',
			plugins: [
				new expiration.ExpirationPlugin({
					maxEntries: 20,
				})
			]
		}).handle(args);
		//		console.log(0,response,0)
		if (response.status < 400)//<400
			return response;
		const ch = await caches.match(args.request.url);
		if (ch)
			return ch;
		else return response;
	} catch (error) {
		return await caches.match(args.request.url);
	}
};
const styleHandler = async (args) => {
	//	console.log(args,8)
	try {
		const response = await new strategies.NetworkFirst({
			plugins: [
				new broadcastUpdate.BroadcastUpdatePlugin({
					channelName: 'style-update',
				})
			]
		}).handle(args);
		//		console.log(0,response,0)
		if (response.status < 400)//<400
			return response;
		const ch = await caches.match(args.request.url);
		if (ch)
			return ch;
		else return response;
	} catch (error) {
		return await caches.match(args.request.url);
	}
};


/*routing.registerRoute(
	new RegExp('/([?].*)?([#].*)?$'),
	new strategies.NetworkFirst({
		cacheName: 'pages',
		plugins: [
			new broadcastUpdate.BroadcastUpdatePlugin({
			channelName: 'index-update',
			})
		],
		ignoreURLParametersMatching: [/.*\/],
		ignoreUrlParametersMatching: [/.*\/] //fucking workbox ignore ignoring
	})
);*/
routing.registerRoute(
	new RegExp('/([?].*)?([#].*)?$'),
	indexHandler
	//function(args){console.log("aaaaaaaah",args);customHandler0(args)}
);


routing.registerRoute(
	"/style.css999999",
	styleHandler
	/*new strategies.NetworkFirst({
		plugins: [
			new broadcastUpdate.BroadcastUpdatePlugin({
			channelName: 'style-update',
			})
		]
	})*/
);
routing.registerRoute(
	"/style.css",
	new strategies.StaleWhileRevalidate({
		plugins: [
			new broadcastUpdate.BroadcastUpdatePlugin({
				channelName: 'style-update',
			})
		]
	})
);

routing.registerRoute(
	new RegExp('hra\\.min\\.js([?].*)?([#].*)?$'),
	hraHandler
);
/*routing.registerRoute(
	new RegExp('hra\\.min\\.js$'),
	new strategies.NetworkFirst({
		cacheName: 'scripts',
		plugins: [
			new expiration.ExpirationPlugin({
				maxEntries: 20,
			})
		]
	})
);*/
//routing.registerRoute(//nefunguje to do skurvenej piče!!
//	new RegExp('ads.*\\.js([?].*)?([#].*)?$'),
//	new strategies.NetworkOnly({
//		cacheName: 'scripts',
//		plugins: [
//			new expiration.ExpirationPlugin({
//				maxEntries: 20,
//			})
//		]
//	})
//);
routing.registerRoute(
	new RegExp('(?<!/ads.*)\\.js$'),
	new strategies.StaleWhileRevalidate({
		cacheName: 'scripts',
		plugins: [
			new expiration.ExpirationPlugin({
				maxEntries: 20,
			})
		]
	})
);
routing.registerRoute(
	new RegExp('\\.html([?].*)?([#].*)?$'),
	new strategies.NetworkFirst({
		cacheName: 'pages',
		plugins: [
			new expiration.ExpirationPlugin({
				maxEntries: 20,
			}),
		],
		matchOptions: { ignoreSearch: true },
		ignoreURLParametersMatching: [/.*/],
		ignoreUrlParametersMatching: [/.*/]
	})
);
routing.registerRoute(
	new RegExp('\\.(png|gif)$'),
	new strategies.StaleWhileRevalidate({
		cacheName: 'images',
		plugins: [
			new expiration.ExpirationPlugin({
				maxEntries: 20,
			}),
		]
	})
);
routing.registerRoute(
	new RegExp('.+/leaders\\.json$'),
	new strategies.NetworkFirst()
);
routing.registerRoute(
	new RegExp('\\.txt$'),
	new strategies.NetworkFirst()
);

const faviconPage = '/favicon-off.png';
const faviconHandler = async (args) => {
	try {
		const response = await new strategies.NetworkOnly().handle(args).catch();
		//		console.log(response,5)
		return response || await caches.match(faviconPage);
	} catch (error) {
		return await caches.match(faviconPage);
	}
};

routing.registerRoute(
	"/favicon.ico",
	faviconHandler
);