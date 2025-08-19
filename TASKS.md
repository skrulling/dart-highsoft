# Always use same ui boxes for throws
In the main match ui, we use some nice boxes to show dart throws.
These will display T20 for tripple 20, instead of 60.
In the spec mode, we use boxes, but these show 60, 25, 50, 40 and so on. Not T20, SB, DB and D20 like we want to show.
I also think we have the same issue when two client are reporting in the match ui, and another player reports a throw, it will use this wrong ui. This needs to be fixed. We should always use the classic dart variant to show throws.
