# The frame and the concept

Sources: Steve Krug, *Don't Make Me Think* (New Riders, 2000): the "trunk test", what a person
dropped onto a screen can tell about where they are and what they can do; Lindgaard, Fernandes,
Dudek & Brown, "Attention web designers: You have 50 milliseconds to make a good first
impression!" (*Behaviour & Information Technology* 25(2), 2006); Bland & Osterwalder, *Testing
Business Ideas* (Wiley, 2019): assumption mapping, by importance and evidence; Gary Klein,
"Performing a Project Premortem" (*Harvard Business Review*, September 2007); Tohidi, Buxton,
Baecker & Sellen, "Getting the Right Design and the Design Right" (CHI 2006) and Buxton,
*Sketching User Experiences* (Morgan Kaufmann, 2007): judging a design needs alternatives beside
it; MacLean, Young, Bellotti & Moran, "Questions, Options, and Criteria" (*Human–Computer
Interaction* 6, 1991): design rationale; Kat Holmes, *Mismatch* (MIT Press, 2018): who a design
leaves out; Connor & Irizarry, *Discussing Design* (O'Reilly, 2015): critique against stated
objectives. On dissent: Schwenk, "Effects of devil's advocacy and dialectical inquiry on decision
making: a meta-analysis" (*Organizational Behavior and Human Decision Processes* 47, 1990);
Nemeth, Brown & Rogers, "Devil's advocate versus authentic dissent" (*European Journal of Social
Psychology* 31, 2001): a position argued from evidence does more than an assigned contrary role.
When Anthropic's `product-brainstorming` skill is installed, its assumption-testing mode is the
method; these are the IDs its results are cited under.

These IDs are for **challenges** (`challenges` in the critic output): questions and objections
put to the designer. They carry no severity and never count in the gate.

| ID | Principle | Raise when |
|---|---|---|
| `FRAME-FIRST-READ` | The screens themselves say what the product is, who it is for and what to do first (Krug; Lindgaard et al.) | A reader told nothing takes it for something else, or takes another task for the main one. Weigh by the frame: it matters most for first-time and untrained users |
| `FRAME-PROBLEM` | The problem is stated without its solution, for a specific person in a specific situation (Connor & Irizarry: critique needs an objective to judge against) | The problem names the feature; the user is "everyone"; the must-not-fail task isn't the one the problem is about |
| `FRAME-ASSUMPTION` | The assumptions that matter most and have least evidence are known and tested first (Bland & Osterwalder) | The design depends on something tagged `[assumption]`, or on something unstated, that would change the design if false |
| `FRAME-PREMORTEM` | Imagine it shipped and failed: the most plausible reasons are looked at now (Klein) | A believable failure story the screens do nothing to prevent |
| `FRAME-ALTERNATIVE` | A design is judged beside other ways of solving the same problem (Tohidi et al.; MacLean et al.) | One approach was taken where a clearly different one would serve the same task; say what each trades |
| `FRAME-EXCLUDED` | Who can't use this as designed, permanently, temporarily or in the situation (Holmes) | The frame's users are narrower than the people in its own context of use; a stress, interruption or ability case nobody designed for |
