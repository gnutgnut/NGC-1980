// INTERIORS: the dev preview (game/dev/interiors.html): every building's rooms cut away, the barracks hut, the ALBATROSS
// interior, the crew figures
export default async function (h) {
  for (const [q, n] of [['b=all&dist=60&pitch=60&yaw=20', 'all-buildings'], ['b=house&dist=16&pitch=62&yaw=30&cut=2.7', 'house-ground-floor'], ['b=house&dist=16&pitch=62&yaw=30', 'house-upstairs'], ['b=terrace&dist=20&pitch=60&yaw=15&cut=2.9', 'terrace-shops'], ['b=church&dist=26&pitch=55&yaw=25&cut=6', 'church'], ['b=barracks&dist=14&pitch=58&yaw=40&cut=3', 'barracks'], ['b=petrol&dist=10&pitch=60&yaw=15', 'kiosk'], ['b=ship&dist=34&pitch=40&yaw=55&cx=10.5&cy=10&cz=4', 'albatross-island'], ['b=ship&dist=60&pitch=50&yaw=60&cx=0&cy=4&cz=8&cut=7.3', 'albatross-hangar'], ['b=crew&dist=8&pitch=15&yaw=200', 'crew']]) {
    await h.goto('dev/interiors.html?' + q); await h.waitFor('window.__ready', 20000); await h.wait(1500); await h.shot(n);
  }
}
