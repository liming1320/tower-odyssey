# Light Native Analysis

Read-only analysis of module.bin SHA256
`34e1178930a3dcb782666b085b9934af144d6d78e9de2feee3f7ec3f51a17e1d`.
All addresses below are RVAs, not VAs. Image base is 0x400000.
This is reverse-engineering evidence, not a full-game acceptance report.

## Current Implementation Is Incorrect

The 75 records in pk32-light-levels.json are not 75 levels. They contain
59 native boards, 5 demo coordinate strings and 11 other records. Eight of
the latter have references from castle code at 0x1c6bxxx; three records at
0x2eb1ac, 0x2eb1e4, 0x2eb21c have references from another game.
The current boolean cross-toggle implementation, all-off initialization
and treatment of code 00 as an inactive tile must be replaced.

## Extraction

- Loader: 0x1c2f5f0. Guard at 0x1c2f681 is 0x8b (140 cases).
- Board dispatch table: 0x1c30240. Each entry points to mov edx,BSTR.
- BSTR length is the little-endian dword immediately before UTF-16LE text.
- Board string: WW HH followed by W*H two-digit codes. Length 4+2*W*H.
- All 140 unique board strings match strings.json. First board at 0x2eac24
  is 11x3. Last at 0x2e40b0 precedes the title. Existing first record is
  original level 139. Some boards are as far away as 0x35f088.
- Level selector 0x1c35590 references 0x2e3f64 (1-140); stores input minus one.
- Decoder 0x1c2fd15..0x1c30179 centers in 16x9 using floor((16-W)/2),
  floor((9-H)/2). Initialize to -1; copy only codes 0..59. Code 99 is invalid.
- Rule text at 0x2e4304: light all lightable objects. Title at 0x2e4150.

## Sprites

PicForm26, BMP 0x7a90dd, public/img/pk32/original/sheet-7a90dd.png.
Renderer 0x1c2eb70; PicForm selection 0x1c2eff6.
For code c, source rectangle ((c%20)*43,387+floor(c/20)*43,42,42).
Destination (21+42*x,21+42*y), SRCCOPY.
Coordinate evidence 0x1c2eebf..0x1c2ef43 and 0x1c2f053..0x1c2f05a.

## State Transitions

Ordinary transform table 0x1c32a10, reached from 0x1c32133:

```text
00..09 -> 01 00 03 02 05 04 07 06 09 08
10..19 -> 11 12 12 14 15 13 17 16 19 18
20..29 -> 21 20 23 22 25 24 27 26 28 29
30..39 -> 30 31 33 32 35 34 36 37 38 39
40..59 -> unchanged
```

Scope helper 0x1c32b40; table 0x1c34684 + byte index table 0x1c346f4.
C=self, L/R/U/D=orthogonal neighbors. Scopes filter out invalid cells and
out-of-bounds coordinates. Long lines are not blocked by holes.

| Codes | Scope |
| --- | --- |
| 0,1,10,11,13,14,15,16 | C,L,R,U,D |
| 2,3 | C and all 8 neighbors |
| 4,5 | 16-cell square perimeter of radius 2, without C |
| 6,7 | C, full row and full column |
| 8,9 | C and both full diagonals |
| 12,17,18,19,28,29,32,34,46,50 | empty |
| 20,21 / 22,23 / 24,25 / 26,27 | C+L / C+R / C+U / C+D |
| 30,33 / 31,35 | L,R / U,D |
| 36,37 / 38,39 | row sorted by x / column sorted by y, excluding C |
| 40,43,47,48,49,54,55,56 | 8 neighbors without C |
| 41,44,51,52,53,57,58,59 | L,R,U,D |
| 42,45 | UL,UR,DL,DR |

Special dispatch: 0x1c32940 + byte index table 0x1c32980.
Special operations move codes, not their ordinary transforms:

- 30/33 swap L,R; 31/35 swap U,D. 33 becomes 32, 35 becomes 34 on success.
- 36/37 cycle valid row cells left/right by one; 38/39 similarly column.
- Rings A=[L,DL,D,DR,R,UR,U,UL], B=[L,D,R,U], E=[UL,DL,DR,UR].
- Left cycle means new[i]=old[(i+1)%n]; right cycle is its inverse.
- 40,47,48,49 cycle A left; 43,54,55,56 cycle A right.
- 41,51,52,53 cycle B left; 44,57,58,59 cycle B right.
- 42 cycles E left; 45 cycles E right.
- Usage changes: 47->46,48->47,49->48,54->46,55->54,56->55;
  51->50,52->51,53->52,57->50,58->57,59->58.
- Swap requires both coordinates in bounds; rings require the entire ring
  in bounds. Otherwise do not move codes or consume usage. Still postprocess.
- Rings/swaps DO move invalid codes; do not use filtered scope for execution.
- Special operation subtables: 0x1c329a0,0x1c329b0,0x1c329c0,0x1c329d4,
  0x1c329e8,0x1c329fc. Boundary checks at 0x1c30549,0x1c307ca,
  0x1c30f4b,0x1c31726,0x1c31d59.

Postprocess at 0x1c3227c..0x1c3292e, table 0x1c32aa0:
Scan x outer 0..15 then y inner 0..8, in-place, exactly once. Every 28/29
source affects its 8 neighbors, in native sequence (not until stable):

- 29: increment 0,2,4,6,8,16,18,20,22,24,26,32,34;
  10/11->12; 12/13->14; others unchanged.
- 28: decrement 1,3,5,7,9,17,19,21,23,25,27,33,35;
  11->10; 13/14->12; others unchanged.

Win check 0x1c34740, tables 0x1c34c24 and 0x1c34c5c:
no state in {0,2,4,6,8,10,12,13,14,16,18,20,22,24,26} remains.

## Native Demos

Dispatch table 0x1c35534 has 20 BSTR entries (cases 0x1c352e7 onward).
Every 4 digits form native zero-based XXYY coordinates. Timer coordinate
reads at 0x1c35899,0x1c35929; scope call 0x1c35a8f; click call 0x1c35dfe.

| Level | BSTR RVA | Coordinates |
| --- | --- | --- |
| 1 | 0x2e4334 | 030407041104 |
| 2 | 0x35ec78 | 06040903 |
| 3 | 0x35ec90 | 07030805 |
| 4 | 0x35ee6c | 0505060308040902 |
| 5 | 0x35f238 | 050206040506080508021003 |
| 6 | 0x35f030 | 05000602080309051106 |
| 7 | 0x2e4518 | 04010605090210040907 |
| 8 | 0x35f060 | 0706080507020604 |
| 9 | 0x2e4ab8 | 0400060208030904090510051106 |
| 10 | 0x35e6b0 | 0501050506060707110708021002 |
| 11 | 0x2e4af8 | 05020905 |
| 12 | 0x2e470c | 0901070304070907 |
| 13 | 0x35ea94 | 050407050703080408021003 |
| 14 | 0x2e48f8 | 0602090206050905 |
| 15 | 0x35df4c | 0502050508041104100510021004 |
| 16 | 0x2e50b4 | 05060705110806010801 |
| 17 | 0x35e124 | 0701060307030704090406070907 |
| 18 | 0x2e54a0 | 07030605070406050705 |
| 19 | 0x2e5694 | 06030904080107060703 |
| 20 | 0x2e3ef4 | 1106100408050906080408050601050204030401080008031102 |

These 20 demos, totaling 103 clicks, passed an independent in-memory
recalculation by the reviewing agent. They cover states 00..03 and 30/31;
they do not establish runtime equivalence of every special state.
