// Where CamArcade's server lives. Fill these in from Supabase → Project Settings → API Keys (see SETUP.md).
// Both are meant to be public: the server only lets the website do what the functions in server/schema.sql allow.
window.CAMARCADE_CONFIG = {
  supabaseUrl: 'https://gcobykzdjjnrukbluqya.supabase.co',   // like 'https://abcdefghijklmnop.supabase.co'
  supabaseKey: 'sb_publishable_NbMcKVVrW0C-072QblUYaA_EImQQBaL',   // the "publishable" key (sb_publishable_…) or the legacy "anon" key (eyJ…). Never the secret one.
  // How two players' browsers find each other. When a network (like school Wi-Fi) blocks a direct connection, they go
  // through a relay: logged-in players get a Cloudflare relay login from the server (ca_turn), and Open Relay is a
  // free spare. (PeerJS's old relays, eu-0/us-0.turn.peerjs.com, are gone: they were taken out.)
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
    { urls: ['turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
  ],
};
