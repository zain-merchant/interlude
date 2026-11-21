# Controller accuracy

Every Mixxx mapping we ship for a controller whose manufacturer publishes a
MIDI message list is checked against that list by
`crates/controller/tests/official_lists.rs`. The lists are typed into
`crates/controller/official/*.tsv` (one per mapping, with the source URL at
the top). The built-in DDJ-FLX4 mapping is checked the same way: it may only
act on messages in Pioneer's list and only light LEDs in it.

A mapping passes when:

- it listens to no message the controller doesn't send,
- it lights no LED the controller doesn't have,
- every core control the list names (play, cue, sync, headphone cue,
  volume, EQ, filter, crossfader, hot cues, loop in/out, reloop, load) is
  bound to that control.

Where a manufacturer's list is wrong or incomplete (a misprint, a SHIFT
layer or LSB left out), the binding is kept and written into the table as an
`extra-` row with the reason. Those are the "Exceptions" below.

"Script (unchecked)" counts core controls bound to a script function, which
a static check can't follow. "Bound" below "Messages in list" means some of
the controller's messages do nothing in that mapping (for example pad modes
the mapping doesn't use); that's missing coverage, not a wrong binding.

Regenerate this table with `dj accuracy`.

## Results

63 controllers, 0 problems.

| Controller | Messages in list | Bound | Checked and right | Script (unchecked) | Exceptions | Problems |
|---|---:|---:|---:|---:|---:|---:|
| Allen and Heath Xone K2 | 2784 | 456 | 0 | 0 | 0 | 0 |
| American Audio VMS4 | 143 | 102 | 12 | 2 | 24 | 0 |
| Behringer DDM4000 | 81 | 0 | 0 | 0 | 0 | 0 |
| DJ TechTools MIDI Fighter Spectra | 176 | 60 | 0 | 0 | 0 | 0 |
| DJ TechTools MIDI Fighter Twister | 151 | 99 | 0 | 0 | 1 | 0 |
| Denon DN SC2000 | 102 | 74 | 2 | 27 | 2 | 0 |
| Denon MC3000 | 436 | 126 | 25 | 0 | 0 | 0 |
| Denon MC4000 | 139 | 122 | 34 | 0 | 0 | 0 |
| Denon-MC6000MK2 | 596 | 187 | 21 | 4 | 0 | 0 |
| Electrix Tweaker | 82 | 70 | 0 | 0 | 0 | 0 |
| FaderFoxDJ2 | 216 | 132 | 34 | 0 | 0 | 0 |
| Hercules DJ Console 4-Mx | 182 | 182 | 0 | 37 | 1 | 0 |
| Hercules DJ Console Mk2 | 47 | 43 | 3 | 4 | 0 | 0 |
| Hercules DJ Console Mk4 | 59 | 55 | 11 | 8 | 0 | 0 |
| Hercules DJ Console RMX 2 | 156 | 112 | 29 | 0 | 0 | 0 |
| Hercules DJ Console RMX | 64 | 55 | 4 | 17 | 0 | 0 |
| Hercules DJ Control Instinct | 72 | 65 | 27 | 0 | 2 | 0 |
| Hercules DJ Control MP3 e2 | 59 | 55 | 1 | 18 | 0 | 0 |
| Hercules DJ Control MP3 | 43 | 40 | 7 | 0 | 0 | 0 |
| Hercules DJ Control Steel | 88 | 71 | 4 | 17 | 0 | 0 |
| Hercules DJControl Compact | 93 | 78 | 21 | 0 | 0 | 0 |
| Hercules_DJControl_Inpulse_200 | 173 | 97 | 28 | 0 | 19 | 0 |
| Hercules_DJControl_Inpulse_300 | 418 | 268 | 26 | 4 | 40 | 0 |
| Hercules_DJControl_Inpulse_500 | 431 | 317 | 0 | 27 | 12 | 0 |
| Hercules_DJControl_Jogvision | 263 | 136 | 17 | 3 | 0 | 0 |
| Korg-KAOSS-DJ | 64 | 54 | 27 | 3 | 27 | 0 |
| Novation Dicer | 66 | 60 | 0 | 0 | 0 | 0 |
| Novation Launchpad MK2 | 80 | 80 | 0 | 0 | 0 | 0 |
| Novation Launchpad Mini MK3 | 80 | 80 | 0 | 0 | 0 | 0 |
| Novation Launchpad | 80 | 80 | 0 | 0 | 0 | 0 |
| Novation-Launchpad-Mini | 80 | 80 | 0 | 0 | 0 | 0 |
| Numark DJ2Go | 26 | 26 | 5 | 11 | 0 | 0 |
| Numark Total Control | 65 | 65 | 1 | 0 | 22 | 0 |
| Pioneer CDJ-2000 | 72 | 56 | 16 | 0 | 0 | 0 |
| Pioneer CDJ-350 Ch1 | 26 | 21 | 5 | 0 | 0 | 0 |
| Pioneer CDJ-350 Ch2 | 26 | 21 | 5 | 0 | 0 | 0 |
| Pioneer CDJ-850 | 74 | 60 | 10 | 0 | 0 | 0 |
| Pioneer DDJ-200 | 98 | 80 | 1 | 18 | 0 | 0 |
| Pioneer DDJ-RX | 1103 | 605 | 0 | 78 | 0 | 0 |
| Pioneer DDJ-SX | 1109 | 640 | 0 | 78 | 0 | 0 |
| Pioneer DDJ-SX2 | 1095 | 605 | 0 | 78 | 0 | 0 |
| Pioneer-DDJ-400 | 389 | 199 | 41 | 4 | 0 | 0 |
| Pioneer-DDJ-800 | 1555 | 361 | 39 | 4 | 0 | 0 |
| Pioneer-DDJ-FLX10 | 1602 | 722 | 31 | 4 | 0 | 0 |
| Pioneer-DDJ-FLX4 | 397 | 281 | 42 | 4 | 0 | 0 |
| Pioneer-DDJ-FLX6 | 846 | 666 | 86 | 8 | 0 | 0 |
| Pioneer-DDJ-SB | 262 | 219 | 0 | 35 | 0 | 0 |
| Pioneer-DDJ-SB2 | 508 | 430 | 0 | 73 | 0 | 0 |
| Pioneer-DDJ-SB3 | 410 | 268 | 17 | 19 | 4 | 0 |
| Pioneer-OPUS-QUAD | 311 | 269 | 60 | 8 | 0 | 0 |
| Pioneer-XDJ-AZ | 942 | 566 | 45 | 12 | 0 | 0 |
| Pioneer-XDJ-RX3 | 797 | 642 | 68 | 8 | 0 | 0 |
| Reloop Beatmix 2-4 | 304 | 257 | 37 | 9 | 12 | 0 |
| Reloop Beatpad | 222 | 183 | 24 | 8 | 15 | 0 |
| Reloop Terminal Mix 2-4 | 440 | 288 | 58 | 10 | 3 | 0 |
| Reloop-Beatmix-2-4-MK2 | 304 | 257 | 37 | 9 | 12 | 0 |
| Reloop-Mixage | 120 | 115 | 15 | 5 | 1 | 0 |
| Stanton-DJC-4 | 405 | 294 | 65 | 1 | 0 | 0 |
| Traktor Kontrol X1 | 80 | 80 | 0 | 10 | 8 | 0 |
| Vestax VCI-100-hile | 112 | 72 | 0 | 0 | 0 | 0 |
| Vestax VCI-100 | 112 | 62 | 0 | 0 | 0 | 0 |
| Vestax VCI-100MKII | 233 | 230 | 21 | 12 | 0 | 0 |
| Vestax VCI-400 | 206 | 190 | 40 | 38 | 8 | 0 |

## Controllers with no public list

These have mappings but no MIDI list from the manufacturer, so they can only
be checked on real hardware (`dj midi` prints what a connected controller
sends and what the mapping does with it): most Numark controllers (all but
DJ2Go and Total Control), Behringer CMD and BCD, Stanton SCS.1 and SCS.3,
DJ-Tech, Ion, Gemini, MixVibes, M-Vave, Icon, Roland DJ-505, Tascam US-428,
Denon MC7000 and DN-HS5500, and the HID controllers (Traktor Kontrol S2/S3/S4,
Pioneer CDJ HID, EKS Otus, Hercules Mk1). Korg nanoKONTROL/nanoKONTROL2/
nanoPAD2, Arturia KeyLab, Akai MPD24 and QuNeo are user-programmable, and
their documents give no single default to check against. The Midi Fighter
Classic list exists but its site blocks automated downloads.
