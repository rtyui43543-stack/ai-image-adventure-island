(function () {
  "use strict";

  // Match the visible action/environment, never a character's presumed powers.
  // These are short original offline effects, not looping ambience or fanfares.
  const definitions = {
    thunder: ["雷電聚能與低沉雷鳴", 2.6],
    wind: ["旋風掠過與御風氣流", 2.6],
    fire: ["火焰升騰與細碎火星", 2.6],
    ice: ["冰晶凝結與清冷共鳴", 2.6],
    portal: ["結界開啟與空間共鳴", 2.6],
    crystal: ["晶石旋轉與柔和清響", 2.2],
    water: ["水流落下與短促水花", 2.2],
    underwater: ["水下氣泡與深水回響", 2.6],
    forest: ["枝葉輕動與林間鳥鳴", 2.6],
    night: ["星空下的安靜微風", 2.6],
    animal: ["動物輕步與柔和窸窣", 2.2],
    wings: ["展翼振動與掠風", 2.2],
    hover: ["懸浮滑行與加速氣流", 2.2],
    engine: ["機械推進與能源啟動", 2.2],
    metal: ["機關轉動與金屬接合", 2.2],
    heavy: ["機甲落步與液壓運作", 2.2],
    psychic: ["念力懸浮與低柔共振", 2.2],
    stream: ["溪水流動與細小漣漪", 2.6],
    shore: ["海浪輕拍與沙岸回流", 2.6],
    scan: ["柔和掃描與科技脈衝", 2.2]
  };

  const profiles = Object.freeze(Object.fromEntries(
    Object.entries(definitions).map(([id, [label, duration]]) => [id, Object.freeze({
      id, label, duration, src: `assets/audio/scenes-v2/${id}.wav`
    })])
  ));

  // Each explicit role/scene pair applies to all four art styles.
  // New or invalid combinations stay silent until deliberately assigned here.
  const mappings = Object.freeze({
    "BR01:BB01": "hover",       // Skater: banked turn on a hovering board.
    "BR01:BB02": "wind",        // Skater: airborne canyon leap.
    "BR01:BB03": "ice",         // Skater: ice mist during a braking turn.
    "BR01:BB04": "metal",       // Skater: wrench adjusting an energy module.
    "BR02:BB05": "forest",      // Tracker: quiet observation on a forest path.
    "BR02:BB06": "forest",      // Tracker: ladder through the canopy to a nest.
    "BR02:BB07": "water",       // Tracker: a paddle entering the river.
    "BR02:BB08": "night",       // Tracker: writing beside a firefly camp.
    "BR03:BB09": "underwater",  // Diver: opening a chest inside a submerged wreck.
    "BR03:BB10": "underwater",  // Diver: hovering quietly to photograph a turtle.
    "BR03:BB11": "underwater",  // Diver: descending into a deep jellyfish ravine.
    "BR03:BB12": "portal",      // Diver: activating glowing patterns on a temple gate.
    "BR04:BB13": "thunder",     // Mage: a branching lightning network in storm clouds.
    "BR04:BB14": "fire",        // Mage: summoning the flaming phoenix.
    "BR04:BB15": "wind",        // Mage: horizontal flight in a large wind current.
    "BR04:BB16": "ice",         // Mage: an expanding protective dome on ice.

    "FR01:FB01": "forest",      // Flower explorer: planting outdoors.
    "FR01:FB02": "water",       // Flower explorer: a watering can over hanging pots.
    "FR01:FB05": "forest",      // Flower explorer: picking fruit among autumn leaves.
    "FR01:FB06": "night",       // Flower explorer: sketching at a moonlit lotus pond.
    "FR02:FB03": "wind",        // Star traveler: balloon launch in the morning air.
    "FR02:FB04": "night",       // Star traveler: quiet stargazing on a snowy peak.
    "FR02:FB07": "metal",       // Star traveler: turning a brass astrolabe.
    "FR02:FB08": "wind",        // Star traveler: gliding over a cloud sea.
    "FR03:FB09": "crystal",     // Magic girl: rotating levitating crystals.
    "FR03:FB10": "water",       // Magic girl: a dolphin-shaped wave rising from the bay.
    "FR03:FB11": "ice",         // Magic girl: snowflakes and an ice phoenix.
    "FR03:FB12": "portal",      // Magic girl: opening a galaxy-filled star gate.
    "FR04:FB13": "forest",      // Animal guardian: returning a nestling to a tree.
    "FR04:FB14": "shore",       // Animal guardian: hatchlings walking toward gentle surf.
    "FR04:FB15": "animal",      // Animal guardian: gentle fox care in a quiet cabin.
    "FR04:FB16": "animal",      // Animal guardian: running with puppies on a grass path.

    // Pikachu is observing/traveling in these pictures, not discharging lightning.
    "PRPIKA:PB01": "stream",
    "PRPIKA:PB02": "shore",
    "PRPIKA:PB03": "night",
    "PRPIKA:PB04": "scan",
    // Charizard spreads/folds its wings; none of these scenes depicts a fire attack.
    "PRCHAR:PB01": "stream",
    "PRCHAR:PB02": "wings",
    "PRCHAR:PB03": "wings",
    "PRCHAR:PB04": "scan",
    "PREEVEE:PB01": "stream",
    "PREEVEE:PB02": "shore",
    "PREEVEE:PB03": "night",
    "PREEVEE:PB04": "animal",
    // Mewtwo visibly levitates water, shells, itself or a light orb in all four.
    "PRMEWTWO:PB01": "psychic",
    "PRMEWTWO:PB02": "psychic",
    "PRMEWTWO:PB03": "psychic",
    "PRMEWTWO:PB04": "psychic",

    "MR01:MB01": "engine",      // Winged knight: thrusters ignite at takeoff.
    "MR01:MB02": "engine",      // Winged knight: powered flight and a banking turn.
    "MR01:MB03": "scan",        // Winged knight: projecting a navigation chart.
    "MR01:MB04": "heavy",       // Winged knight: knee-down landing in fine snow.
    "MR02:MB05": "engine",      // Mechanical dragon: wing/core activation, not fire breath.
    "MR02:MB06": "wings",       // Mechanical dragon: wings spread in canyon flight.
    "MR02:MB07": "wind",        // Mechanical dragon: surveying from a high cloud-surrounded perch.
    "MR02:MB08": "crystal",     // Mechanical dragon: energizing an ancient crystal.
    "MR03:MB09": "scan",        // Mechanical panther: scanning from a neon rooftop.
    "MR03:MB10": "forest",      // Mechanical panther: lightly stepping through plants.
    "MR03:MB11": "wind",        // Mechanical panther: airborne leap between rock ledges.
    "MR03:MB12": "engine",      // Mechanical panther: powered sprint with energy trails.
    "MR04:MB13": "heavy",       // Heavy guardian: lifting its armored forearms.
    "MR04:MB14": "heavy",       // Heavy guardian: deep steps through snow.
    "MR04:MB15": "heavy",       // Heavy guardian: hydraulically lifting a large beam.
    "MR04:MB16": "metal"        // Heavy guardian: aligning and fitting an engine module.
  });

  function resolve(selection) {
    if (!selection || typeof selection.roleId !== "string" ||
        typeof selection.backgroundId !== "string") return null;
    const key = `${selection.roleId}:${selection.backgroundId}`;
    return Object.prototype.hasOwnProperty.call(mappings, key)
      ? profiles[mappings[key]] : null;
  }

  window.SCENE_AUDIO = Object.freeze({ profiles, mappings, resolve });
}());
