# Sokoban IV Native Evidence

Source: module.bin, image base 0x400000, SHA256
34e1178930a3dcb782666b085b9934af144d6d78e9de2feee3f7ec3f51a17e1d.
Addresses below are RVAs and direct offsets into the captured memory image.

## Corrected Data And Routing

- Loader 0x1bf41a0; guard 0x1bf4237 accepts indices 0..22.
- Dispatch table 0x1bf4a60; cases 0x1bf4247..0x1bf42ed assign BSTRs.
- 0x1bf33a8 passes stored zero-based index to loader unchanged.
- Label code 0x1bf3497..0x1bf34a6 adds one to that index.
- Level 1: BSTR0x2f1c3c, 4x6. Level 23: BSTR0x2ef0ac, 11x7.
- Previous sorted 19-record extraction represented levels 22 through 4,
  in reverse order. Title-boundary extraction excluded level 23.
- New extractor follows all 23 branches, validates exact BSTR lengths and
  dimensions, and retains source offsets and actual native numbers.
- Gallery previously passed casual ID "sokoban", which selects the first
  generic game name; its second puzzle launcher was also a generic map.
  The corrected entry has one named casual launcher for Sokoban IV.

## Decoder And Movement

Raw 0=floor,1..4=four box colors,5=wall,6=player. There are no goal tiles.
Native box values are raw+4 (5..8), wall is25, player is separate from floor.
Evidence: 0x1bf491e..0x1bf497b (boxes), 0x1bf489c (wall),
0x1bf48b8..0x1bf4905 (player).

Center maps inside 11x9, padding remains empty walkable floor:
floor((11-width)/2),floor((9-height)/2). Integer division calls at
0x1bf457d and0x1bf45bf; dimension bases at0x1bf455e and0x1bf45a0.

Push exactly one box one cell; both same-color and different-color second
boxes block the push. Bounds are the full 11x9 surface, not map dimensions.

| Direction | Branch | Empty adjacent | Empty beyond |
| --- | --- | --- | --- |
| Left | 0x1bf4cd2 | 0x1bf4db1 | 0x1bf4f8e |
| Up | 0x1bf4fc4 | 0x1bf50a2 | 0x1bf527f |
| Right | 0x1bf52b5 | 0x1bf5396 | 0x1bf5573 |
| Down | 0x1bf562b | 0x1bf570b | 0x1bf58e8 |

Copy/clear blocks: 0x1bf55f1..0x1bf5620, 0x1bf5966..0x1bf5994.

## Victory And Navigation

Rule text BSTR3076896 says to bring same-colored boxes together.
Native marks both boxes in every right/down same-color pair at0x1bf5fa0
and0x1bf60c4. Colors with exactly one box are exempt at0x1bf6169.
Unmatched boxes cause failure at0x1bf61d9. 0x1bf6381..0x1bf63b3 requires
positive box count and no unmatched box. Disconnected pairs may win;
diagonal contact does not count. This is not a connectivity/flood-fill test.

The check is performed after the movement/redraw path, even if a move was
blocked. A native UI-state bypass at0x1bf5a68 is still unidentified.
On victory timer is disabled at0x1bf63ed/0x1bf63f2, then congratulations
dialog at0x1bf643b. Demo mode suppresses that dialog.
Manual Next increments and wraps23->1 at0x1bf6b70..0x1bf6b93.

## Artwork

PicForm16/BMP0xc313c5, existing sheet-c313c5.png,709x835.
32x32 sprite rectangles:

- Floor: (677,0). Evidence 0x1bf0fd4,0x1bf0fdf,0x1bf1097.
- Boxes1..4: (677,160/192/224/256). Wall: (677,800).
- Player: (283+32*frame,32*direction), frames0/1.
- Directions: down0,right1,up2,left3. Animation interval500ms.
- Pieces use SRCCOPY; player uses bitwise RGB SRCPAINT (0x1bf3dea).
- Internal board352x288, tiles32x32, destination(32*x,32*y).
- Visible surface380x316, board copied to(14,14),0x1bf4073.
- Outer frame uses PicForm14/sheet-d3525b.png and14x14 pieces:
  corners(0,0),(185,0),(0,32),(185,32), edges top(14,0),bottom(14,32),
  left(0,14),right(185,14). PicForm evidence0x1bf0c61.

## Native Demos

Only first three levels have native demo strings. Selector0x1bf6873..0x1bf689c.
The timer adds37 to each digit before calling the same movement routine:
0=left,1=up,2=right,3=down. Demo cadence600ms at0x1bf69af.

| Level | Case RVA | BSTR RVA | Keys |
| --- | --- | --- | --- |
| 1 | 0x1bf6890 | 0x25dc28 | 123 |
| 2 | 0x1bf6889 | 0x2ef8dc | 0212312 |
| 3 | 0x1bf6882 | 0x2efc68 | 2321132133221000103 |

First-level player indices:48 ->37 ->38 ->49. Box4 final indices26,27;
box3 final indices59,60. All three native demos (29 keys) solve their maps
using the new model. This is model replay, not automated native EXE playback.

## Acceptance Limits

Keep rules-partial and fullGameRulesVerified=false. Exact save/resume,
the unidentified UI bypass, full original menu behavior and all23 complete
playthroughs have not been certified. Browser tests cover actual gallery
launch routing,23 loads per viewport, native first-level clicks, three
demo playbacks,99 initial tile pixel comparisons, win acknowledgement,
timer cleanup, restart, undo and responsive geometry. They do not constitute
full pixel comparison against screenshots from the native running EXE.
