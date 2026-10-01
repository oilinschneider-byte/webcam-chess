# Builds lib/rhymes.js for Rhyme Race: rhyme families grouped by pronunciation (CMU Pronouncing Dictionary),
# limited to real dictionary words (the ENABLE list in lib/words.js, so no names), plus the hand-made family lists
# below as the "familiar" words. To add prompt words or familiar rhymes, edit the lists and run this again
# (right-click > Run with PowerShell). It downloads the dictionary (3.6 MB) the first time.
param([switch]$Report)
$site = Split-Path $PSScriptRoot -Parent
$cmu = Join-Path $env:TEMP 'cmudict.dict'
if (-not (Test-Path $cmu)) {
  'Downloading the CMU Pronouncing Dictionary...'
  Invoke-WebRequest 'https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict' -OutFile $cmu -UseBasicParsing
}

# The familiar prompt words (Rhyme Race only ever asks these).
$prompts = @'
light night fight kite right white cat hat bat day play stay rain train brain cake lake make ball wall call blue true shoe
car star far tree free bee mouse house cold gold old fun run sun game name same moon soon spoon chair hair care boat goat coat
clock rock lock dog fog frog king ring sing fish wish book look cook phone stone bone race face place round sound ground
dream team cream school cool pool green clean mean fast last blast more score store time rhyme crime red bed head park dark
shark snow show glow beat sweet heat road load code side ride hide hand sand land brown town clown late date gate black back
track bell shell well hill skill still heart start art big pig wig fire tire wire quick stick brick ship trip flip win spin
thin sit hit fit top stop shop hot spot shot bug hug rug jump bump pump junk trunk dunk cash flash crash camp lamp stamp bank
tank rank friend send bend best test rest beer cheer clear week seek feel wheel nice rice price fine line mine sky fly try
cow now how wood good hood food mood rude tough rough stuff dust trust must mail sail tail ape cape shape draw saw law born
corn horn short sport port
'@

# The hand-made family lists (every word here is a familiar answer; which family it's in comes from how it sounds).
$familiar = @'
alight bight bite blight bright byte cite contrite delight despite excite fight flight forthright fright height ignite incite
invite kite knight light might night plight polite quite recite right rite sight site slight smite sprite tight tonight trite
white wight write at bat brat cat chat fat flat gnat hat mat pat rat sat scat slat spat splat stat tat that allay array astray
away bay betray bray clay convey decay delay dismay display day essay flay fray gay gray hay jay lay may nay okay pay play
portray pray prey ray repay say slay spray stay stray sway today tray way weigh abstain arcane arraign attain bane brain cane
chain champagne complain constrain crane deign detain disdain domain drain explain gain grain insane lane main mane mundane
obtain ordain pain pane plain plane profane rain reign rein remain restrain retain sane slain sprain stain strain sustain train
vain vein ache awake bake brake break cake fake flake forsake lake make opaque quake rake remake sake shake snake stake steak
take wake all appall ball bawl call crawl drawl enthrall fall gall hall haul install mall maul pall recall shawl small sprawl
stall tall wall blew blue brew chew clue crew cue dew do drew due few flew glue grew hue knew new pew queue renew screw shoe
slew stew through threw true view you zoo afar bar bazaar car char cigar far guitar jar par scar spar star tar agree bee
decree disagree fee flee free glee guarantee key knee me plea referee sea see ski spree tea three tree wee we blouse grouse
house louse mouse spouse behold bold bowled cold fold foretold gold hold mold old polled rolled scold sold told unfold begun
bun done dun fun gun none one outrun pun rerun run shun spun stun sun ton undone won acclaim aim blame came claim dame defame
disclaim fame flame frame game lame maim name proclaim reclaim same shame tame afternoon balloon boon buffoon cartoon cocoon
croon dune goon honeymoon lagoon loon monsoon moon noon platoon prune saloon soon spoon swoon tune affair air aware bare bear
blare care chair dare despair fair fare flair flare glare hair hare impair lair pair pear prayer prepare rare repair share
snare spare square stair stare swear wear where afloat bloat boat coat dote float goat moat note oat quote rote throat tote
vote wrote block clock crock dock flock frock knock lock mock rock shock sock stock bog clog dog fog frog hog jog log bring
cling ding fling king ring sing sling spring sting string swing thing wing wring dish fish swish wish book brook cook crook
forsook hook look nook overlook rook shook took alone atone bone cone condone drone flown groan grown known loan moan own
phone postpone prone shown stone throne thrown tone unknown zone ace base brace case chase disgrace embrace face grace lace
mace pace place race replace space trace abound astound bound compound confound crowned drowned expound found ground hound
mound pound profound rebound resound round sound surround beam cream deem dream esteem gleam ream scheme scream seam seem
steam stream supreme team theme cool drool fool ghoul pool rule school stool tool bean clean dean glean green lean mean
obscene queen scene screen seen serene sheen teen unseen blast broadcast cast fast forecast last mast outlast passed past vast
adore ashore bore chore core deplore door floor four gore ignore lore more ore outscore pour roar score shore snore soar sore
store tore wore chime climb crime dime grime lime mime overtime prime rhyme rime slime sublime thyme time bed bled bread bred
dead dread fed fled head instead led misled red said shed shred sled sped spread stead thread ark bark dark embark hark lark
mark park remark shark spark stark beau blow bow crow dough flow glow go grow know low mow no row show slow snow stow throw
toe tow woe beat cheat cleat compete conceit defeat delete eat feat feet fleet greet heat meat meet neat peat repeat seat
sheet skeet sleet street sweet treat wheat code flowed glowed goad load mode node owed road showed slowed stowed toad abide
bide bride collide cried decide died divide dried glide guide hide lied pride provide ride side slide snide spied stride tide
tried wide band banned bland brand canned command demand grand hand land manned planned sand scanned stand strand brown clown
crown down drown frown gown noun renown town bait crate date debate eight fate freight gate grate great hate late mate plate
rate relate skate slate state straight trait wait weight back black clack crack hack jack lack pack plaque quack rack sack
shack slack smack snack stack tack track whack bell cell dell dwell excel fell gel hell motel propel repel sell shell smell
spell swell tell well yell bill chill drill fill frill grill hill ill kill mill pill quill shrill skill spill still thrill
till trill will art cart chart dart depart heart mart part restart smart start tart big dig fig gig jig pig rig twig wig
acquire attire choir conspire desire dire expire fire hire inspire liar mire require retire sire spire tire transpire wire
brick chick click flick kick lick nick pick prick quick rick sick slick stick thick tick trick wick chip clip dip drip flip
grip hip lip nip rip ship sip skip slip snip strip tip trip whip zip bin chin din fin grin kin pin shin sin skin spin thin tin
twin win bit fit grit hit knit lit pit quit sit slit spit split wit bop chop cop crop drop flop hop mop pop prop shop slop stop
swap top blot clot cot dot got hot knot lot not plot pot rot shot slot spot squat tot bug dug hug jug mug plug pug rug shrug
slug snug tug bump clump dump hump jump lump pump rump slump stump thump trump bunk chunk drunk dunk flunk funk hunk junk punk
skunk sunk trunk ash bash brash cash clash crash dash flash gash hash lash mash rash sash slash smash splash stash thrash trash
camp champ clamp cramp damp lamp ramp stamp tramp bank blank crank drank flank frank prank rank sank shank spank tank thank
yank bend blend fend friend lend mend offend pretend send spend tend trend vend bent cent dent event meant rent scent sent
spent tent vent went best breast chest crest dressed guest jest nest pest quest rest test vest west bless chess dress guess
less mess press stress yes appear beer cheer clear dear ear fear gear hear here near peer rear sear sheer steer tear year
career deer engineer pioneer volunteer beak bleak cheek creak creek freak geek leak meek peak peek reek seek sleek speak streak
tweak weak week deal eel feel heel kneel meal peel reel seal steel steal wheel believe bereave cleave eve grieve leave retrieve
sleeve weave dice ice mice nice price rice slice spice twice vice align benign decline define dine fine line mine nine pine
shine sign spine swine tine vine wine buy by cry die dry eye fly fry guy high lie my pie pry sigh sky spy tie try why allow
brow chow cow how now plow prow sow vow wow could good hood should stood wood would brood crude dude food glued mood nude
prude rude screwed shrewd bluff buff cuff fluff huff rough stuff tough bust crust dust gust just lust must rust thrust trust
bus fuss plus thus us ale bail bale dale fail flail frail gale hail jail mail male nail pale pail rail sail sale scale snail
stale tale trail veil whale tail wail ape cape drape gape grape shape scrape tape awe claw craw draw flaw jaw law paw raw saw
straw dawn drawn fawn gone lawn pawn spawn yawn blur burr cur err fur her purr sir slur spur stir hurt pert shirt skirt spurt
dirt flirt cork fork pork stork torque born corn horn morn scorn sworn thorn torn worn court fort port short snort sport sort
thwart
'@

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Linq;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
public static class Rhymes {
  // The rhyming part: the last stressed vowel and everything after it, in one consistent American English:
  // "cot" = "caught" (AO = AA, except before R); near = here; poor = tour; four = more; fire = "fi-er"; hour = "ow-er".
  public static string KeyOf(string[] ph) {
    int i = ph.Length - 1;
    for (; i >= 0; i--) { char c = ph[i][ph[i].Length - 1]; if (c == '1' || c == '2') break; }
    if (i < 0) return null; // a reduced, unstressed form (like "good" said as "gid")
    if (i == ph.Length - 1 && ph[i] == "AA2") return null; // the dictionary's "feta" = "fet-AH": a final -a really sounds like "uh"
    var k = new List<string>();
    for (int j = i; j < ph.Length; j++) k.Add(ph[j].TrimEnd('0', '1', '2'));
    for (int j = 0; j < k.Count; j++) {
      bool nextR = j + 1 < k.Count && k[j + 1] == "R";
      if (k[j] == "AO" && !nextR) k[j] = "AA";
      if (!nextR) continue;
      if (k[j] == "IY") k[j] = "IH";
      else if (k[j] == "UW") k[j] = "UH";
      else if (k[j] == "OW") k[j] = "AO";
      else if (k[j] == "EY") k[j] = "EH";
      else if (k[j] == "AY" || k[j] == "AW" || k[j] == "OY") k[j + 1] = "ER";
    }
    return string.Join(" ", k);
  }
  public static Dictionary<string, List<string>> Pron = new Dictionary<string, List<string>>(); // word -> keys (first = main)
  public static void Load(string path) {
    var rx = new Regex(@"^([a-z]+)(\(\d+\))? ([A-Z0-9 ]+?)\s*(#.*)?$");
    foreach (var line in File.ReadLines(path)) {
      var m = rx.Match(line);
      if (!m.Success) continue;
      var key = KeyOf(m.Groups[3].Value.Trim().Split(' '));
      if (key == null) continue;
      List<string> l;
      if (!Pron.TryGetValue(m.Groups[1].Value, out l)) Pron[m.Groups[1].Value] = l = new List<string>();
      if (!l.Contains(key)) l.Add(key);
    }
  }
}
'@

[Rhymes]::Load($cmu)
# familiar words the pronunciation dictionary doesn't have
foreach ($e in @(@('smite', 'AY T'), @('vend', 'EH N D'), @('enthrall', 'AA L'))) { [Rhymes]::Pron[$e[0]] = [System.Collections.Generic.List[string]]::new([string[]]@($e[1])) }
# words whose dictionary entry is really a name's pronunciation (or a mistake)
foreach ($w in 'wormhole minimill natal nidal dumas saul shaul sall lall markkaa' -split ' ') { [void][Rhymes]::Pron.Remove($w) }
$wl = Get-Content "$site\lib\words.js" -Raw
$enable = [System.Collections.Generic.HashSet[string]]::new([string[]]($wl.Substring($wl.IndexOf("'") + 1, $wl.LastIndexOf("'") - $wl.IndexOf("'") - 1) -split ' '))
$pron = [Rhymes]::Pron
$promptList = @($prompts -split '\s+' | Where-Object { $_ })
$famList = @($familiar -split '\s+' | Where-Object { $_ } | Select-Object -Unique)
$famSet = [System.Collections.Generic.HashSet[string]]::new([string[]]$famList)
"CMU words: $($pron.Count); ENABLE words: $($enable.Count); prompts: $($promptList.Count); familiar words: $($famList.Count)"

# key -> all words with that rhyme (any of their pronunciations)
$byKey = @{}
foreach ($w in $pron.Keys) { foreach ($k in $pron[$w]) { if (-not $byKey.ContainsKey($k)) { $byKey[$k] = [System.Collections.Generic.List[string]]::new() }; $byKey[$k].Add($w) } }

$missingPrompts = @($promptList | Where-Object { -not $pron.ContainsKey($_) })
if ($missingPrompts) { "PROMPTS NOT IN CMU: $($missingPrompts -join ', ')" }
$multi = @($promptList | Where-Object { $pron.ContainsKey($_) -and $pron[$_].Count -gt 1 } | ForEach-Object { "$_ (" + ($pron[$_] -join ' / ') + ')' })
if ($multi) { "prompts with more than one pronunciation (the first is used): " + ($multi -join '; ') }
$famNoCmu = @($famList | Where-Object { -not $pron.ContainsKey($_) })
"familiar words missing from CMU: " + ($famNoCmu -join ', ')
$famNoEnable = @($famList | Where-Object { -not $enable.Contains($_) })
"familiar words missing from ENABLE (kept anyway): " + ($famNoEnable -join ', ')

# One family per rhyme sound that at least one prompt uses.
$families = [ordered]@{}
foreach ($p in $promptList) {
  if (-not $pron.ContainsKey($p)) { continue }
  $k = $pron[$p][0]
  if (-not $families.Contains($k)) { $families[$k] = [System.Collections.Generic.List[string]]::new() }
  $families[$k].Add($p)
}
$out = [System.Text.StringBuilder]::new()
$total = 0
$rows = @()
foreach ($k in $families.Keys) {
  $all = @($byKey[$k] | Where-Object { $enable.Contains($_) -or $famSet.Contains($_) } | Sort-Object -Unique)
  $common = @($all | Where-Object { $famSet.Contains($_) -or $promptList -contains $_ })
  $rare = @($all | Where-Object { -not ($famSet.Contains($_) -or $promptList -contains $_) })
  $total += $all.Count
  $rows += [pscustomobject]@{ Key = $k; Prompts = ($families[$k] -join ' '); Common = $common.Count; Rare = $rare.Count }
  [void]$out.Append("  ['" + ($families[$k] -join ' ') + "', '" + ($common -join ' ') + "', '" + ($rare -join ' ') + "'],`n")
}
"families: $($families.Count); valid answers in all: $total"
if ($Report) { $rows | Format-Table -AutoSize | Out-String -Width 200 }

# Familiar words that sound different from the family they were listed in (shown for checking).
$header = @"
/* Rhyme families for Rhyme Race, generated by make-rhymes.ps1. Each row: [prompt words, familiar answers, rarer answers].
   Every word in a row rhymes perfectly with every other (same last stressed vowel and everything after it), in
   American English where "cot" and "caught" sound the same. Answers are real dictionary words (no names).

   Pronunciations come from the CMU Pronouncing Dictionary:
   Copyright (C) 1993-2015 Carnegie Mellon University. All rights reserved.
   Redistribution and use in source and binary forms, with or without modification, are permitted provided that the
   following conditions are met: 1. Redistributions of source code must retain the above copyright notice, this list of
   conditions and the following disclaimer. The contents of this file are deemed to be source code. 2. Redistributions
   in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the
   documentation and/or other materials provided with the distribution. This work was supported in part by funding from
   the Defense Advanced Research Projects Agency, the Office of Naval Research and the National Science Foundation of the
   United States of America, and by member companies of the Carnegie Mellon Sphinx Speech Consortium.
   THIS SOFTWARE IS PROVIDED BY CARNEGIE MELLON UNIVERSITY "AS IS" AND ANY EXPRESSED OR IMPLIED WARRANTIES, INCLUDING,
   BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN
   NO EVENT SHALL CARNEGIE MELLON UNIVERSITY NOR ITS EMPLOYEES BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
   EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS
   OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
   CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
   SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
   Word list: ENABLE (public domain). */
window.RHYME_FAMILIES = [
"@
$js = $header + $out.ToString() + "];`n"
[IO.File]::WriteAllText("$site\lib\rhymes.js", $js, [Text.UTF8Encoding]::new($false))
"lib/rhymes.js: " + (Get-Item "$site\lib\rhymes.js").Length + " bytes"
