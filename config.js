// Where CamArcade's server lives. Fill these in from Supabase → Project Settings → API Keys (see SETUP.md).
// Both are meant to be public: the server only lets the website do what the functions in server/schema.sql allow.
window.CAMARCADE_CONFIG = {
  supabaseUrl: 'https://gcobykzdjjnrukbluqya.supabase.co',   // like 'https://abcdefghijklmnop.supabase.co'
  supabaseKey: 'sb_publishable_NbMcKVVrW0C-072QblUYaA_EImQQBaL',   // the "publishable" key (sb_publishable_…) or the legacy "anon" key (eyJ…). Never the secret one.
  // How two players' browsers find each other. When a network (like school Wi-Fi) blocks a direct connection,
  // the video and game go through the Metered relay (metered.ca → thecamarcade → TURN Server → Credentials).
  iceServers: [
    { urls: 'stun:stun.relay.metered.ca:80' },
    { urls: 'turn:global.relay.metered.ca:80', username: '9d1baa2bea072c04eff6b287', credential: '8mgWlbAkoxKHvuMb' },
    { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username: '9d1baa2bea072c04eff6b287', credential: '8mgWlbAkoxKHvuMb' },
    { urls: 'turn:global.relay.metered.ca:443', username: '9d1baa2bea072c04eff6b287', credential: '8mgWlbAkoxKHvuMb' },
    { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username: '9d1baa2bea072c04eff6b287', credential: '8mgWlbAkoxKHvuMb' },
  ],
};
