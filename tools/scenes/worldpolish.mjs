// ngc/world-polish: the second batch of the lived-in world in the preview page (game/dev/world.html): the pub on the
// square, the school, the chapel, cars round the square, a harbour, a farmyard, a village with every third building
// knocked about (damaged / destroyed), the faction structures with their fences and the AA emplacements.
const go = (q, label, extra = []) => [`goto dev/world.html?${q}`, 'waitFor 40000 window.__ready', 'wait 900', 'eval window.__stats', `shot ${label}`, ...extra];
export default {
  name: 'worldpolish',
  query: 'dev/world.html?focus=pub&dist=26&pitch=12',
  steps: [
    'waitFor 40000 window.__ready', 'wait 900', 'eval window.__stats', 'shot pub', 'notblank',
    ...go('focus=pub&n=1&dist=34&pitch=16', 'pub2'),
    ...go('focus=school&dist=40&pitch=20', 'school'),
    ...go('focus=chapel&dist=30&pitch=10', 'chapel'),
    ...go('focus=pcar&dist=22&pitch=25', 'square-cars'),
    ...go('focus=psign&dist=14&pitch=8', 'sign'),
    ...go('focus=harbour&dist=70&pitch=22&yaw=200', 'harbour'),
    ...go('focus=harbour&n=1&dist=60&pitch=25&yaw=140', 'harbour2'),
    ...go('focus=farm&dist=70&pitch=30', 'farmyard'),
    ...go('focus=village&dist=150&pitch=30&damage=1', 'village-damage'),
    ...go('focus=village&dist=60&pitch=22&damage=1', 'village-damage-close'),
    ...go('structs=1&dist=330&pitch=42&yaw=20&fogn=900&fogf=2000', 'structs', ['eval (__view(30, 22, 36, -110, -75), 1)', 'wait 400', 'shot hq-ours', 'eval (__view(20, 30, 40, 75, 90), 1)', 'wait 400', 'shot aa-sites']),
  ],
};
