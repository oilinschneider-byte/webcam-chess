// Where CamArcade's server lives. Fill these in from Supabase → Project Settings → API Keys (see SETUP.md).
// Both are meant to be public: the server only lets the website do what the functions in server/schema.sql allow.
window.CAMARCADE_CONFIG = {
  supabaseUrl: 'https://gcobykzdjjnrukbluqya.supabase.co',   // like 'https://abcdefghijklmnop.supabase.co'
  supabaseKey: 'sb_publishable_NbMcKVVrW0C-072QblUYaA_EImQQBaL',   // the "publishable" key (sb_publishable_…) or the legacy "anon" key (eyJ…). Never the secret one.
};
