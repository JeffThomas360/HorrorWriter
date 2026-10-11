-- The four public-domain classics move from front-end code (src/lib/seedArchives.js)
-- into public.books, with their full texts in place of the old ~200-word excerpts.
--
-- Why: critiques need a real story row (book_comments.book_id is a uuid FK), and the
-- critique economy (next PR) validates quoted passages against the story text on the
-- server. With the classics in code, a critique on Poe could not be stored at all.
--
-- archive_author marks a classic: it names the original author, and such a row has no
-- member author (author_id is null), so no member can edit or delete it under the
-- existing RLS. slug keeps the old /library/read/archive-*/ URLs working unchanged; the
-- front end routes any archive-* key to the slug column (storyKeyColumn), hence the prefix.
--
-- Sources: Project Gutenberg #2148 (Poe, Works vol. 2), #12122 (Jacobs), #1952
-- (Gilman); Wikisource, Weird Tales vol. 5 no. 5, May 1925 (Lovecraft). All public
-- domain in the US. created_at holds each work's first publication date.

alter table public.books
  add column slug text,
  add column archive_author text;

alter table public.books
  add constraint books_slug_unique unique (slug),
  add constraint books_slug_format check (slug is null or slug ~ '^archive-[a-z0-9]+(-[a-z0-9]+)*$'),
  add constraint books_archive_has_no_member_author check (archive_author is null or author_id is null),
  add constraint books_slug_only_for_archives check (slug is null or archive_author is not null);

insert into public.books
  (id, slug, title, archive_author, lede, cover, badge, mod_status, created_at, content)
values
  ('a4c1e000-0000-4000-8000-000000000001', 'archive-tell-tale-heart', 'The Tell-Tale Heart', 'Edgar Allan Poe',
   'True!—nervous—very, very dreadfully nervous I had been and am; but why will you say that I am mad?',
   'blood', 'ARCHIVE SAMPLE', 'live', '1843-01-01T00:00:00Z',
   $classic$True!—nervous—very, very dreadfully nervous I had been and am; but why will you say that I am mad? The disease had sharpened my senses—not destroyed—not dulled them. Above all was the sense of hearing acute. I heard all things in the heaven and in the earth. I heard many things in hell. How, then, am I mad? Hearken! and observe how healthily—how calmly I can tell you the whole story.

It is impossible to say how first the idea entered my brain; but once conceived, it haunted me day and night. Object there was none. Passion there was none. I loved the old man. He had never wronged me. He had never given me insult. For his gold I had no desire. I think it was his eye! yes, it was this! He had the eye of a vulture—a pale blue eye, with a film over it. Whenever it fell upon me, my blood ran cold; and so by degrees—very gradually—I made up my mind to take the life of the old man, and thus rid myself of the eye forever.

Now this is the point. You fancy me mad. Madmen know nothing. But you should have seen me. You should have seen how wisely I proceeded—with what caution—with what foresight—with what dissimulation I went to work! I was never kinder to the old man than during the whole week before I killed him. And every night, about midnight, I turned the latch of his door and opened it—oh, so gently! And then, when I had made an opening sufficient for my head, I put in a dark lantern, all closed, closed, that no light shone out, and then I thrust in my head. Oh, you would have laughed to see how cunningly I thrust it in! I moved it slowly—very, very slowly, so that I might not disturb the old man’s sleep. It took me an hour to place my whole head within the opening so far that I could see him as he lay upon his bed. Ha!—would a madman have been so wise as this? And then, when my head was well in the room, I undid the lantern cautiously—oh, so cautiously—cautiously (for the hinges creaked)—I undid it just so much that a single thin ray fell upon the vulture eye. And this I did for seven long nights—every night just at midnight—but I found the eye always closed; and so it was impossible to do the work; for it was not the old man who vexed me, but his Evil Eye. And every morning, when the day broke, I went boldly into the chamber, and spoke courageously to him, calling him by name in a hearty tone, and inquiring how he has passed the night. So you see he would have been a very profound old man, indeed, to suspect that every night, just at twelve, I looked in upon him while he slept.

Upon the eighth night I was more than usually cautious in opening the door. A watch’s minute hand moves more quickly than did mine. Never before that night had I felt the extent of my own powers—of my sagacity. I could scarcely contain my feelings of triumph. To think that there I was, opening the door, little by little, and he not even to dream of my secret deeds or thoughts. I fairly chuckled at the idea; and perhaps he heard me; for he moved on the bed suddenly, as if startled. Now you may think that I drew back—but no. His room was as black as pitch with the thick darkness, (for the shutters were close fastened, through fear of robbers,) and so I knew that he could not see the opening of the door, and I kept pushing it on steadily, steadily.

I had my head in, and was about to open the lantern, when my thumb slipped upon the tin fastening, and the old man sprang up in bed, crying out—“Who’s there?”

I kept quite still and said nothing. For a whole hour I did not move a muscle, and in the meantime I did not hear him lie down. He was still sitting up in the bed listening;—just as I have done, night after night, hearkening to the death watches in the wall.

Presently I heard a slight groan, and I knew it was the groan of mortal terror. It was not a groan of pain or of grief—oh, no!—it was the low stifled sound that arises from the bottom of the soul when overcharged with awe. I knew the sound well. Many a night, just at midnight, when all the world slept, it has welled up from my own bosom, deepening, with its dreadful echo, the terrors that distracted me. I say I knew it well. I knew what the old man felt, and pitied him, although I chuckled at heart. I knew that he had been lying awake ever since the first slight noise, when he had turned in the bed. His fears had been ever since growing upon him. He had been trying to fancy them causeless, but could not. He had been saying to himself—“It is nothing but the wind in the chimney—it is only a mouse crossing the floor,” or “It is merely a cricket which has made a single chirp.” Yes, he had been trying to comfort himself with these suppositions: but he had found all in vain. All in vain; because Death, in approaching him had stalked with his black shadow before him, and enveloped the victim. And it was the mournful influence of the unperceived shadow that caused him to feel—although he neither saw nor heard—to feel the presence of my head within the room.

When I had waited a long time, very patiently, without hearing him lie down, I resolved to open a little—a very, very little crevice in the lantern. So I opened it—you cannot imagine how stealthily, stealthily—until, at length a single dim ray, like the thread of the spider, shot from out the crevice and fell full upon the vulture eye.

It was open—wide, wide open—and I grew furious as I gazed upon it. I saw it with perfect distinctness—all a dull blue, with a hideous veil over it that chilled the very marrow in my bones; but I could see nothing else of the old man’s face or person: for I had directed the ray as if by instinct, precisely upon the damned spot.

And have I not told you that what you mistake for madness is but over-acuteness of the sense?—now, I say, there came to my ears a low, dull, quick sound, such as a watch makes when enveloped in cotton. I knew that sound well, too. It was the beating of the old man’s heart. It increased my fury, as the beating of a drum stimulates the soldier into courage.

But even yet I refrained and kept still. I scarcely breathed. I held the lantern motionless. I tried how steadily I could maintain the ray upon the eye. Meantime the hellish tattoo of the heart increased. It grew quicker and quicker, and louder and louder every instant. The old man’s terror must have been extreme! It grew louder, I say, louder every moment!—do you mark me well? I have told you that I am nervous: so I am. And now at the dead hour of the night, amid the dreadful silence of that old house, so strange a noise as this excited me to uncontrollable terror. Yet, for some minutes longer I refrained and stood still. But the beating grew louder, louder! I thought the heart must burst. And now a new anxiety seized me—the sound would be heard by a neighbour! The old man’s hour had come! With a loud yell, I threw open the lantern and leaped into the room. He shrieked once—once only. In an instant I dragged him to the floor, and pulled the heavy bed over him. I then smiled gaily, to find the deed so far done. But, for many minutes, the heart beat on with a muffled sound. This, however, did not vex me; it would not be heard through the wall. At length it ceased. The old man was dead. I removed the bed and examined the corpse. Yes, he was stone, stone dead. I placed my hand upon the heart and held it there many minutes. There was no pulsation. He was stone dead. His eye would trouble me no more.

If still you think me mad, you will think so no longer when I describe the wise precautions I took for the concealment of the body. The night waned, and I worked hastily, but in silence. First of all I dismembered the corpse. I cut off the head and the arms and the legs.

I then took up three planks from the flooring of the chamber, and deposited all between the scantlings. I then replaced the boards so cleverly, so cunningly, that no human eye—not even his—could have detected any thing wrong. There was nothing to wash out—no stain of any kind—no blood-spot whatever. I had been too wary for that. A tub had caught all—ha! ha!

When I had made an end of these labors, it was four o’clock—still dark as midnight. As the bell sounded the hour, there came a knocking at the street door. I went down to open it with a light heart,—for what had I now to fear? There entered three men, who introduced themselves, with perfect suavity, as officers of the police. A shriek had been heard by a neighbour during the night; suspicion of foul play had been aroused; information had been lodged at the police office, and they (the officers) had been deputed to search the premises.

I smiled,—for what had I to fear? I bade the gentlemen welcome. The shriek, I said, was my own in a dream. The old man, I mentioned, was absent in the country. I took my visitors all over the house. I bade them search—search well. I led them, at length, to his chamber. I showed them his treasures, secure, undisturbed. In the enthusiasm of my confidence, I brought chairs into the room, and desired them here to rest from their fatigues, while I myself, in the wild audacity of my perfect triumph, placed my own seat upon the very spot beneath which reposed the corpse of the victim.

The officers were satisfied. My manner had convinced them. I was singularly at ease. They sat, and while I answered cheerily, they chatted of familiar things. But, ere long, I felt myself getting pale and wished them gone. My head ached, and I fancied a ringing in my ears: but still they sat and still chatted. The ringing became more distinct:—it continued and became more distinct: I talked more freely to get rid of the feeling: but it continued and gained definiteness—until, at length, I found that the noise was not within my ears.

No doubt I now grew _very_ pale;—but I talked more fluently, and with a heightened voice. Yet the sound increased—and what could I do? It was a low, dull, quick sound—much such a sound as a watch makes when enveloped in cotton. I gasped for breath—and yet the officers heard it not. I talked more quickly—more vehemently; but the noise steadily increased. I arose and argued about trifles, in a high key and with violent gesticulations; but the noise steadily increased. Why would they not be gone? I paced the floor to and fro with heavy strides, as if excited to fury by the observations of the men—but the noise steadily increased. Oh God! what could I do? I foamed—I raved—I swore! I swung the chair upon which I had been sitting, and grated it upon the boards, but the noise arose over all and continually increased. It grew louder—louder—louder! And still the men chatted pleasantly, and smiled. Was it possible they heard not? Almighty God!—no, no! They heard!—they suspected!—they knew!—they were making a mockery of my horror!—this I thought, and this I think. But anything was better than this agony! Anything was more tolerable than this derision! I could bear those hypocritical smiles no longer! I felt that I must scream or die! and now—again!—hark! louder! louder! louder! _louder!_

“Villains!” I shrieked, “dissemble no more! I admit the deed!—tear up the planks!—here, here!—It is the beating of his hideous heart!”$classic$),
  ('a4c1e000-0000-4000-8000-000000000002', 'archive-erich-zann', 'The Music of Erich Zann', 'H. P. Lovecraft',
   'I have examined maps of the city with the greatest care, yet have never again found the Rue d''Auseil.',
   'cyan', 'ARCHIVE SAMPLE', 'live', '1922-03-01T00:00:00Z',
   $classic$I have examined maps of the city with the greatest care, yet have never again found the Rue d'Auseil. These maps have not been modern maps alone, for I know that names change. I have, on the contrary, delved deeply into all the antiquities of the place; and have personally explored every region, of whatever name, which could possibly answer to the street I knew as the Rue d'Auseil. But despite all I have done, it remains an humiliating fact that I cannot find the house, the street, or even the locality, where, during the last months of my impoverished life as a student of metaphysics at the university, I heard the music of Erich Zann.

That my memory is broken, I do not wonder; for my health, physical and mental, was gravely disturbed throughout the period of my residence in the Rue d'Auseil, and I recall that I took none of my few acquaintances there. But that I cannot find the place again is both singular and perplexing; for it was within a half-hour's walk of the university and was distinguished by peculiarities which could hardly be forgotten by anyone who had been there. I have never met a person who has seen the Rue d'Auseil.

The Rue d'Auseil lay across a dark river bordered by precipitous brick blear-windowed warehouses and spanned by a ponderous bridge of dark stone. It was always shadowy along that river, as if the smoke of neighboring factories shut out the sun perpetually. The river was also odorous with evil stenches which I have never smelled elsewhere, and which may some day help me to find it, since I should recognize them at once. Beyond the bridge were narrow cobbled streets with rails; and then came the ascent, at first gradual, but incredibly steep as the Rue d'Auseil was reached.

I have never seen another street as narrow and steep as the Rue d'Auseil. It was almost a cliff, closed to all vehicles, consisting in several places of flights of steps, and ending at the top in a lofty ivied wall. Its paving was irregular, sometimes stone slabs, sometimes cobblestones, and sometimes bare earth with struggling greenish-gray vegetation. The houses were tall, peaked-roofed, incredibly old, and crazily leaning backward, forward, and sidewise. Occasionally an opposite pair, both leaning forward, almost met across the street like an arch; and certainly they kept most of the light from the ground below. There were a few overhead bridges from house to house across the street.

The inhabitants of that street impressed me peculiarly. At first I thought it was because they were all silent and reticent; but later decided it was because they were all very old. I do not know how I came to live on such a street, but I was not myself when I moved there. I had been living in many poor places, always evicted for want of money; until at last I came upon that tottering house in the Rue d'Auseil kept by the paralytic Blandot. It was the third house from the top of the street, and by far the tallest of them all.

My room was on the fifth story; the only inhabited room there, since the house was almost empty. On the night I arrived I heard strange music from the peaked garret overhead, and the next day asked old Blandot about it. He told me it was an old German viol-player, a strange dumb man who signed his name as Erich Zann, and who played evenings in a cheap theater orchestra; adding that Zann's desire to play in the night after his return from the theater was the reason he had chosen this lofty and isolated garret room, whose single gable window was the only point on the street from which one could look over the terminating wall at the declivity and panorama beyond.

Thereafter I heard Zann every night, and although he kept me awake, I was haunted by the weirdness of his music. Knowing little of the art myself, I was yet certain that none of his harmonies had any relation to music I had heard before; and concluded that he was a composer of highly original genius. The longer I listened, the more I was fascinated, until after a week I resolved to make the old man's acquaintance.

One night, as he was returning from his work, I intercepted Zann in the hallway and told him that I would like to know him and be with him when he played. He was a small, lean, bent person, with shabby clothes, blue eyes, grotesque, satyrlike face, and nearly bald head; and at my first words seemed both angered and frightened. My obvious friendliness, however, finally melted him; and he grudgingly motioned to me to follow him up the dark, creaking and rickety attic stairs. His room, one of only two in the steeply pitched garret, was on the west side, toward the high wall that formed the upper end of the street. Its size was very great, and seemed the greater because of its extraordinary bareness and neglect. Of furniture there was only a narrow iron bedstead, a dingy wash-stand, a small table, a large bookcase, an iron music-rack, and three old-fashioned chairs. Sheets of music were piled in disorder about the floor. The walls were of bare boards, and had probably never known plaster; whilst the abundance of dust and cobwebs made the place seem more deserted than inhabited. Evidently Erich Zann's world of beauty lay in some far cosmos of the imagination.

Motioning me to sit down, the dumb man closed the door, turned the large wooden bolt, and lighted a candle to augment the one he had brought with him. He now removed his viol from its moth-eaten covering, and taking it, seated himself in the least uncomfortable of the chairs. He did not employ the music-rack, but, offering no choice and playing from memory, enchanted me for over an hour with strains I had never heard before; strains which must have been of his own devising. To describe their exact nature is impossible for one unversed in music. They were a kind of fugue, with recurrent passages of the most captivating quality, but to me were notable for the absence of any of the weird notes I had overheard from my room below on other occasions.

Those haunting notes I had remembered, and had often hummed and whistled inaccurately to myself, so when the player at length laid down his bow I asked him if he would render some of them. As I began my request the wrinkled satyrlike face lost the bored placidity it had possessed during the playing, and seemed to show the same curious mixture of anger and fright which I had noticed when first I accosted the old man. For a moment I was inclined to use persuasion, regarding rather lightly the whims of senility; and even tried to awaken my host's weirder mood by whistling a few of the strains to which I had listened the night before. But I did not pursue this course for more than a moment; for when the dumb musician recognized the whistled air his face grew suddenly distorted with an expression wholly beyond analysis, and his long, cold, bony right hand reached out to stop my mouth and silence the crude imitation. As he did this he further demonstrated his eccentricity by casting a startled glance toward the lone curtained window, as if fearful of some intruder—a glance doubly absurd, since the garret stood high and inaccessible above all the adjacent roofs, this window being the only point on the steep street, as the concierge had told me, from which one could see over the wall at the summit.

The old man's glance brought Blandot's remark to my mind, and with a certain capriciousness I felt a wish to look out over the wide and dizzying panorama of moonlit roofs and city lights beyond the hilltop, which of all the dwellers in the Rue d'Auseil only this crabbed musician could see. I moved toward the window and would have drawn aside the nondescript curtains, when with a frightened rage even greater than before, the dumb lodger was upon me again; this time motioning with his head toward the door as he nervously strove to drag me thither with both hands. Now thoroughly disgusted with my host, I ordered him to release me, and told him I would go at once. His clutch relaxed, and as he saw my disgust and offense, his own anger seemed to subside. He tightened his relaxing grip, but this time in a friendly manner, forcing me into a chair; then with an appearance of wistfulness crossing to the littered table, where he wrote many words with a pencil, in the labored French of a foreigner.

The note which he finally handed me was an appeal for tolerance and forgiveness. Zann said that he was old, lonely, and afflicted with strange fears and nervous disorders connected with his music and with other things. He had enjoyed my listening to his music, and wished I would come again and not mind his eccentricities. But he could not play to another his weird harmonies, and could not bear hearing them from another; nor could he bear having anything in his room touched by another. He had not known until our hallway conversation that I could overhear his playing in my room, and now asked me if I would arrange with Blandot to take a lower room where I could not hear him in the night. He would, he wrote, defray the difference in rent.

As I sat deciphering the execrable French, I felt more lenient toward the old man. He was a victim of physical and nervous suffering, as was I; and my metaphysical studies had taught me kindness. In the silence there came a slight sound from the window—the shutter must have rattled in the night-wind, and for some reason I started almost as violently as did Erich Zann. So when I had finished reading I shook my host by the hand, and departed as a friend.

The next day Blandot gave me a more expensive room on the third floor, between the apartments of an aged money-lender and the room of a respectable upholsterer. There was no one on the fourth floor.

It was not long before I found that Zann's eagerness for my company was not as great as it had seemed while he was persuading me to move down from the fifth story. He did not ask me to call on him, and when I did call he appeared uneasy and played listlessly. This was always at night—in the day he slept and would admit no one. My liking for him did not grow, though the attic room and the weird music seemed to hold an odd fascination for me. I had a curious desire to look out of that window, over the wall and down the unseen slope at the glittering roofs and spires which must lie outspread there. Once I went up to the garret during theater hours, when Zann was away, but the door was locked.

What I did succeed in doing was to overhear the nocturnal playing of the dumb old man. At first I would tiptoe up to my old fifth floor, then I grew bold enough to climb the last creaking staircase to the peaked garret. There in the narrow hall, outside the bolted door with the covered keyhole, I often heard sounds which filled me with an indefinable dread—the dread of vague wonder and brooding mystery. It was not that the sounds were hideous, for they were not; but that they held vibrations suggesting nothing on this globe of earth, and that at certain intervals they assumed a symphonic quality which I could hardly conceive as produced by one player. Certainly, Erich Zann was a genius of wild power. As the weeks passed, the playing grew wilder, whilst the old musician acquired an increasing haggardness and furtiveness pitiful to behold. He now refused to admit me at any time, and shunned me whenever we met on the stairs.

Then one night as I listened at the door I heard the shrieking viol swell into a chaotic babel of sound; a pandemonium which would have led me to doubt my own shaking sanity had there not come from behind that barred portal a piteous proof that the horror was real—the awful, inarticulate cry which only a mute can utter, and which rises only in moments of the most terrible fear or anguish. I knocked repeatedly at the door, but received no response. Afterward I waited in the black hallway, shivering with cold and fear, till I heard the poor musician's feeble effort to rise from the floor by the aid of a chair. Believing him just conscious after a fainting fit, I renewed my rapping, at the same time calling out my name reassuringly. I heard Zann stumble to the window and close both shutter and sash, then, stumble to the door, which he falteringly unfastened to admit me. This time his delight at having me present was real; for his distorted face gleamed with relief, while he clutched at my coat as a child clutches at its mother's skirts.

Shaking pathetically, the old man forced me into a chair whilst he sank into another, beside which his viol and bow lay carelessly on the floor. He sat for some time inactive, nodding oddly, but having a paradoxical suggestion of intense and frightened listening. Subsequently he seemed to be satisfied, and crossing to a chair by the table wrote a brief note, handed it to me, and returned to the table, where he began to write rapidly and incessantly. The note implored me in the name of mercy, and for the sake of my own curiosity, to wait where I was while he prepared a full account in German of all the marvels and terrors which beset him. I waited, and the dumb man's pencil flew.

It was perhaps an hour later, while I still waited and while the old musician's feverishly written sheets still continued to pile up, that I saw Zann start as from the hint of a horrible shock. Unmistakably he was looking at the curtained window and listening shudderingly. Then I half fancied I heard a sound myself; though it was not a horrible sound, but rather an exquisitely low and infinitely distant musical note, suggesting a player in one of the neighboring houses, or in some abode beyond the lofty wall over which I had never been able to look. Upon Zann the effect was terrible, for, dropping his pencil, suddenly he rose, seized his viol, and commenced to rend the night with the wildest playing I had ever heard from his bow save when listening at the barred door.

It would be useless to describe the playing of Erich Zann on that dreadful night. It was more horrible than anything I had ever overheard, because I could now see the expression of his face, and could realize that this time the motive was stark fear. He was trying to make a noise; to ward something off or drown something out—what, I could not imagine, awesome though I felt it must be. The playing grew fantastic, delirious, and hysterical, yet kept to the last the qualities of supreme genius which I know this strange old man possessed. I recognized the air—it was a wild Hungarian dance popular in the theaters, and I reflected for a moment that this was the first time I had ever heard Zann play the work of another composer.

Louder and louder, wilder and wilder, mounted the shrieking and whining of that desperate viol. The player was dripping with an uncanny perspiration and twisted like a monkey, always looking frantically at the curtained window. In his frenzied strains I could almost see shadowy satyrs and bacchanals dancing and whirling insanely through seething abysses of clouds and smoke and lightning. And then I thought I heard a shriller, steadier note that was not from the viol; a calm, deliberate, purposeful, mocking note from far away in the west.

At this juncture the shutter began to rattle in a howling night-wind which had sprung up outside as if in answer to the mad playing within. Zann's screaming viol now outdid itself, emitting sounds I had never thought a viol could emit. The shutter rattled more loudly, unfastened, and commenced slamming against the window. Then the glass broke shiveringly under the persistent impacts, and the chill wind rushed in, making the candles sputter and rustling the sheets of paper on the table where Zann had begun to write out his horrible secret. I looked at Zann, and saw that he was past conscious observation. His blue eyes were bulging, glassy and sightless, and the frantic playing had become a blind, mechanical, unrecognizable orgy that no pen could even suggest.

A sudden gust, stronger than the others, caught up the manuscript and bore it toward the window. I followed the flying sheets in desperation, but they were gone before I reached the demolished panes. Then I remembered my old wish to gaze from this window, the only window in the Rue d'Auseil from which one might see the slope beyond the wall, and the city outspread beneath. It was very dark, but the city's lights always burned, and I expected to see them there amidst the rain and wind. Yet when I looked from that highest of all gable windows, looked while the candles sputtered and the insane viol howled with the night-wind, I saw no city spread below, and no friendly lights gleamed from remembered streets, but only the blackness of space illimitable; unimagined space alive with motion and music, and having no semblance of anything on earth. And as I stood there looking in terror, the wind blew out both the candles in that ancient peaked garret, leaving me in savage and impenetrable darkness with chaos and pandemonium before me, and the demon madness of that night-baying viol behind me.

I staggered back in the dark, without the means of striking a light, crashing against the table, overturning a chair, and finally groping my way to the place where the blackness screamed with shocking music. To save myself and Erich Zann I could at least try, whatever the powers opposed to me. Once I thought some chill thing brushed me, and I screamed, but my scream could not be heard above that hideous viol. Suddenly out of the blackness the madly sawing bow struck me, and I knew I was close to the player. I felt ahead, touched the back of Zann's chair, and then found and shook his shoulder in an effort to bring him to his senses.

He did not respond, and still the viol shrieked on without slackening. I moved my hand to his head, whose mechanical nodding I was able to stop, and shouted in his ear that we must both flee from the unknown things of the night. But he neither answered me nor abated the frenzy of his unutterable music, while all through the garret strange currents of wind seemed to dance in the darkness and babel. When my hand touched his ear I shuddered, though I knew not why—knew not why till I felt of the still face; the ice-cold, stiffened, unbreathing face whose glassy eyes bulged uselessly into the void. And then, by some miracle finding the door and the large wooden bolt, I plunged wildly away from that glassy-eyed thing in the dark, and from the ghoulish howling of that accursed viol whose fury increased even as I plunged.

Leaping, floating, flying down those endless stairs through the dark house; racing mindlessly out into the narrow, steep, and ancient street of steps and tottering houses; clattering down steps and over cobbles to the lower streets and the putrid canyon-walled river; panting across the great dark bridge to the broader, healthier streets and boulevards we know; all these are terrible impressions that linger with me. And I recall that there was no wind, and that the moon was out, and that all the lights of the city twinkled.

Despite my most careful searches and investigations, I have never since been able to find the Rue d'Auseil. But I am not wholly sorry; either for this or for the loss in undreamable abysses of the closely-written sheets which alone could have explained the music of Erich Zann.$classic$),
  ('a4c1e000-0000-4000-8000-000000000003', 'archive-monkeys-paw', 'The Monkey''s Paw', 'W. W. Jacobs',
   'Without, the night was cold and wet, but in the small parlour of Laburnam Villa the fire burned brightly.',
   'bone', 'ARCHIVE SAMPLE', 'live', '1902-09-01T00:00:00Z',
   $classic$### I.

Without, the night was cold and wet, but in the small parlour of Laburnam Villa the blinds were drawn and the fire burned brightly. Father and son were at chess, the former, who possessed ideas about the game involving radical changes, putting his king into such sharp and unnecessary perils that it even provoked comment from the white-haired old lady knitting placidly by the fire.

“Hark at the wind,” said Mr. White, who, having seen a fatal mistake after it was too late, was amiably desirous of preventing his son from seeing it.

“I’m listening,” said the latter, grimly surveying the board as he stretched out his hand. “Check.”

“I should hardly think that he’d come to-night,” said his father, with his hand poised over the board.

“Mate,” replied the son.

“That’s the worst of living so far out,” bawled Mr. White, with sudden and unlooked-for violence; “of all the beastly, slushy, out-of-the-way places to live in, this is the worst. Pathway’s a bog, and the road’s a torrent. I don’t know what people are thinking about. I suppose because only two houses in the road are let, they think it doesn’t matter.”

“Never mind, dear,” said his wife, soothingly; “perhaps you’ll win the next one.”

Mr. White looked up sharply, just in time to intercept a knowing glance between mother and son. The words died away on his lips, and he hid a guilty grin in his thin grey beard.

“There he is,” said Herbert White, as the gate banged to loudly and heavy footsteps came toward the door.

The old man rose with hospitable haste, and opening the door, was heard condoling with the new arrival. The new arrival also condoled with himself, so that Mrs. White said, “Tut, tut!” and coughed gently as her husband entered the room, followed by a tall, burly man, beady of eye and rubicund of visage.

“Sergeant-Major Morris,” he said, introducing him.

The sergeant-major shook hands, and taking the proffered seat by the fire, watched contentedly while his host got out whiskey and tumblers and stood a small copper kettle on the fire.

At the third glass his eyes got brighter, and he began to talk, the little family circle regarding with eager interest this visitor from distant parts, as he squared his broad shoulders in the chair and spoke of wild scenes and doughty deeds; of wars and plagues and strange peoples.

“Twenty-one years of it,” said Mr. White, nodding at his wife and son. “When he went away he was a slip of a youth in the warehouse. Now look at him.”

“He don’t look to have taken much harm,” said Mrs. White, politely.

“I’d like to go to India myself,” said the old man, “just to look round a bit, you know.”

“Better where you are,” said the sergeant-major, shaking his head. He put down the empty glass, and sighing softly, shook it again.

“I should like to see those old temples and fakirs and jugglers,” said the old man. “What was that you started telling me the other day about a monkey’s paw or something, Morris?”

“Nothing,” said the soldier, hastily. “Leastways nothing worth hearing.”

“Monkey’s paw?” said Mrs. White, curiously.

“Well, it’s just a bit of what you might call magic, perhaps,” said the sergeant-major, offhandedly.

His three listeners leaned forward eagerly. The visitor absent-mindedly put his empty glass to his lips and then set it down again. His host filled it for him.

“To look at,” said the sergeant-major, fumbling in his pocket, “it’s just an ordinary little paw, dried to a mummy.”

He took something out of his pocket and proffered it. Mrs. White drew back with a grimace, but her son, taking it, examined it curiously.

“And what is there special about it?” inquired Mr. White as he took it from his son, and having examined it, placed it upon the table.

“It had a spell put on it by an old fakir,” said the sergeant-major, “a very holy man. He wanted to show that fate ruled people’s lives, and that those who interfered with it did so to their sorrow. He put a spell on it so that three separate men could each have three wishes from it.”

His manner was so impressive that his hearers were conscious that their light laughter jarred somewhat.

“Well, why don’t you have three, sir?” said Herbert White, cleverly.

The soldier regarded him in the way that middle age is wont to regard presumptuous youth. “I have,” he said, quietly, and his blotchy face whitened.

“And did you really have the three wishes granted?” asked Mrs. White.

“I did,” said the sergeant-major, and his glass tapped against his strong teeth.

“And has anybody else wished?” persisted the old lady.

“The first man had his three wishes. Yes,” was the reply; “I don’t know what the first two were, but the third was for death. That’s how I got the paw.”

His tones were so grave that a hush fell upon the group.

“If you’ve had your three wishes, it’s no good to you now, then, Morris,” said the old man at last. “What do you keep it for?”

The soldier shook his head. “Fancy, I suppose,” he said, slowly. “I did have some idea of selling it, but I don’t think I will. It has caused enough mischief already. Besides, people won’t buy. They think it’s a fairy tale; some of them, and those who do think anything of it want to try it first and pay me afterward.”

“If you could have another three wishes,” said the old man, eyeing him keenly, “would you have them?”

“I don’t know,” said the other. “I don’t know.”

He took the paw, and dangling it between his forefinger and thumb, suddenly threw it upon the fire. White, with a slight cry, stooped down and snatched it off.

“Better let it burn,” said the soldier, solemnly.

“If you don’t want it, Morris,” said the other, “give it to me.”

“I won’t,” said his friend, doggedly. “I threw it on the fire. If you keep it, don’t blame me for what happens. Pitch it on the fire again like a sensible man.”

The other shook his head and examined his new possession closely. “How do you do it?” he inquired.

“Hold it up in your right hand and wish aloud,” said the sergeant-major, “but I warn you of the consequences.”

“Sounds like the _Arabian Nights_,” said Mrs. White, as she rose and began to set the supper. “Don’t you think you might wish for four pairs of hands for me?”

Her husband drew the talisman from pocket, and then all three burst into laughter as the sergeant-major, with a look of alarm on his face, caught him by the arm.

“If you must wish,” he said, gruffly, “wish for something sensible.”

Mr. White dropped it back in his pocket, and placing chairs, motioned his friend to the table. In the business of supper the talisman was partly forgotten, and afterward the three sat listening in an enthralled fashion to a second instalment of the soldier’s adventures in India.

“If the tale about the monkey’s paw is not more truthful than those he has been telling us,” said Herbert, as the door closed behind their guest, just in time for him to catch the last train, “we sha’nt make much out of it.”

“Did you give him anything for it, father?” inquired Mrs. White, regarding her husband closely.

“A trifle,” said he, colouring slightly. “He didn’t want it, but I made him take it. And he pressed me again to throw it away.”

“Likely,” said Herbert, with pretended horror. “Why, we’re going to be rich, and famous and happy. Wish to be an emperor, father, to begin with; then you can’t be henpecked.”

He darted round the table, pursued by the maligned Mrs. White armed with an antimacassar.

Mr. White took the paw from his pocket and eyed it dubiously. “I don’t know what to wish for, and that’s a fact,” he said, slowly. “It seems to me I’ve got all I want.”

“If you only cleared the house, you’d be quite happy, wouldn’t you?” said Herbert, with his hand on his shoulder. “Well, wish for two hundred pounds, then; that ’ll just do it.”

His father, smiling shamefacedly at his own credulity, held up the talisman, as his son, with a solemn face, somewhat marred by a wink at his mother, sat down at the piano and struck a few impressive chords.

“I wish for two hundred pounds,” said the old man distinctly.

A fine crash from the piano greeted the words, interrupted by a shuddering cry from the old man. His wife and son ran toward him.

“It moved,” he cried, with a glance of disgust at the object as it lay on the floor.

“As I wished, it twisted in my hand like a snake.”

“Well, I don’t see the money,” said his son as he picked it up and placed it on the table, “and I bet I never shall.”

“It must have been your fancy, father,” said his wife, regarding him anxiously.

He shook his head. “Never mind, though; there’s no harm done, but it gave me a shock all the same.”

They sat down by the fire again while the two men finished their pipes. Outside, the wind was higher than ever, and the old man started nervously at the sound of a door banging upstairs. A silence unusual and depressing settled upon all three, which lasted until the old couple rose to retire for the night.

“I expect you’ll find the cash tied up in a big bag in the middle of your bed,” said Herbert, as he bade them good-night, “and something horrible squatting up on top of the wardrobe watching you as you pocket your ill-gotten gains.”

He sat alone in the darkness, gazing at the dying fire, and seeing faces in it. The last face was so horrible and so simian that he gazed at it in amazement. It got so vivid that, with a little uneasy laugh, he felt on the table for a glass containing a little water to throw over it. His hand grasped the monkey’s paw, and with a little shiver he wiped his hand on his coat and went up to bed.

### II.

In the brightness of the wintry sun next morning as it streamed over the breakfast table he laughed at his fears. There was an air of prosaic wholesomeness about the room which it had lacked on the previous night, and the dirty, shrivelled little paw was pitched on the sideboard with a carelessness which betokened no great belief in its virtues.

“I suppose all old soldiers are the same,” said Mrs. White. “The idea of our listening to such nonsense! How could wishes be granted in these days? And if they could, how could two hundred pounds hurt you, father?”

“Might drop on his head from the sky,” said the frivolous Herbert.

“Morris said the things happened so naturally,” said his father, “that you might if you so wished attribute it to coincidence.”

“Well, don’t break into the money before I come back,” said Herbert as he rose from the table. “I’m afraid it’ll turn you into a mean, avaricious man, and we shall have to disown you.”

His mother laughed, and following him to the door, watched him down the road; and returning to the breakfast table, was very happy at the expense of her husband’s credulity. All of which did not prevent her from scurrying to the door at the postman’s knock, nor prevent her from referring somewhat shortly to retired sergeant-majors of bibulous habits when she found that the post brought a tailor’s bill.

“Herbert will have some more of his funny remarks, I expect, when he comes home,” she said, as they sat at dinner.

“I dare say,” said Mr. White, pouring himself out some beer; “but for all that, the thing moved in my hand; that I’ll swear to.”

“You thought it did,” said the old lady soothingly.

“I say it did,” replied the other. “There was no thought about it; I had just—What’s the matter?”

His wife made no reply. She was watching the mysterious movements of a man outside, who, peering in an undecided fashion at the house, appeared to be trying to make up his mind to enter. In mental connection with the two hundred pounds, she noticed that the stranger was well dressed, and wore a silk hat of glossy newness. Three times he paused at the gate, and then walked on again. The fourth time he stood with his hand upon it, and then with sudden resolution flung it open and walked up the path. Mrs. White at the same moment placed her hands behind her, and hurriedly unfastening the strings of her apron, put that useful article of apparel beneath the cushion of her chair.

She brought the stranger, who seemed ill at ease, into the room. He gazed at her furtively, and listened in a preoccupied fashion as the old lady apologized for the appearance of the room, and her husband’s coat, a garment which he usually reserved for the garden. She then waited as patiently as her sex would permit, for him to broach his business, but he was at first strangely silent.

“I—was asked to call,” he said at last, and stooped and picked a piece of cotton from his trousers. “I come from ‘Maw and Meggins.’”

The old lady started. “Is anything the matter?” she asked, breathlessly. “Has anything happened to Herbert? What is it? What is it?”

Her husband interposed. “There, there, mother,” he said, hastily. “Sit down, and don’t jump to conclusions. You’ve not brought bad news, I’m sure, sir;” and he eyed the other wistfully.

“I’m sorry—” began the visitor.

“Is he hurt?” demanded the mother, wildly.

The visitor bowed in assent. “Badly hurt,” he said, quietly, “but he is not in any pain.”

“Oh, thank God!” said the old woman, clasping her hands. “Thank God for that! Thank—”

She broke off suddenly as the sinister meaning of the assurance dawned upon her and she saw the awful confirmation of her fears in the other’s averted face. She caught her breath, and turning to her slower-witted husband, laid her trembling old hand upon his. There was a long silence.

“He was caught in the machinery,” said the visitor at length in a low voice.

“Caught in the machinery,” repeated Mr. White, in a dazed fashion, “yes.”

He sat staring blankly out at the window, and taking his wife’s hand between his own, pressed it as he had been wont to do in their old courting-days nearly forty years before.

“He was the only one left to us,” he said, turning gently to the visitor. “It is hard.”

The other coughed, and rising, walked slowly to the window. “The firm wished me to convey their sincere sympathy with you in your great loss,” he said, without looking round. “I beg that you will understand I am only their servant and merely obeying orders.”

There was no reply; the old woman’s face was white, her eyes staring, and her breath inaudible; on the husband’s face was a look such as his friend the sergeant might have carried into his first action.

“I was to say that ‘Maw and Meggins’ disclaim all responsibility,” continued the other. “They admit no liability at all, but in consideration of your son’s services, they wish to present you with a certain sum as compensation.”

Mr. White dropped his wife’s hand, and rising to his feet, gazed with a look of horror at his visitor. His dry lips shaped the words, “How much?”

“Two hundred pounds,” was the answer.

Unconscious of his wife’s shriek, the old man smiled faintly, put out his hands like a sightless man, and dropped, a senseless heap, to the floor.

### III.

In the huge new cemetery, some two miles distant, the old people buried their dead, and came back to a house steeped in shadow and silence. It was all over so quickly that at first they could hardly realize it, and remained in a state of expectation as though of something else to happen —something else which was to lighten this load, too heavy for old hearts to bear.

But the days passed, and expectation gave place to resignation—the hopeless resignation of the old, sometimes miscalled, apathy. Sometimes they hardly exchanged a word, for now they had nothing to talk about, and their days were long to weariness.

It was about a week after that the old man, waking suddenly in the night, stretched out his hand and found himself alone. The room was in darkness, and the sound of subdued weeping came from the window. He raised himself in bed and listened.

“Come back,” he said, tenderly. “You will be cold.”

“It is colder for my son,” said the old woman, and wept afresh.

The sound of her sobs died away on his ears. The bed was warm, and his eyes heavy with sleep. He dozed fitfully, and then slept until a sudden wild cry from his wife awoke him with a start.

“_The paw!_” she cried wildly. “The monkey’s paw!”

He started up in alarm. “Where? Where is it? What’s the matter?”

She came stumbling across the room toward him. “I want it,” she said, quietly. “You’ve not destroyed it?”

“It’s in the parlour, on the bracket,” he replied, marvelling. “Why?”

She cried and laughed together, and bending over, kissed his cheek.

“I only just thought of it,” she said, hysterically. “Why didn’t I think of it before? Why didn’t _you_ think of it?”

“Think of what?” he questioned.

“The other two wishes,” she replied, rapidly. “We’ve only had one.”

“Was not that enough?” he demanded, fiercely.

“No,” she cried, triumphantly; “we’ll have one more. Go down and get it quickly, and wish our boy alive again.”

The man sat up in bed and flung the bedclothes from his quaking limbs. “Good God, you are mad!” he cried, aghast.

“Get it,” she panted; “get it quickly, and wish—Oh, my boy, my boy!”

Her husband struck a match and lit the candle. “Get back to bed,” he said, unsteadily. “You don’t know what you are saying.”

“We had the first wish granted,” said the old woman, feverishly; “why not the second?”

“A coincidence,” stammered the old man.

“Go and get it and wish,” cried his wife, quivering with excitement.

The old man turned and regarded her, and his voice shook. “He has been dead ten days, and besides he—I would not tell you else, but—I could only recognize him by his clothing. If he was too terrible for you to see then, how now?”

“Bring him back,” cried the old woman, and dragged him toward the door. “Do you think I fear the child I have nursed?”

He went down in the darkness, and felt his way to the parlour, and then to the mantelpiece. The talisman was in its place, and a horrible fear that the unspoken wish might bring his mutilated son before him ere he could escape from the room seized upon him, and he caught his breath as he found that he had lost the direction of the door. His brow cold with sweat, he felt his way round the table, and groped along the wall until he found himself in the small passage with the unwholesome thing in his hand.

Even his wife’s face seemed changed as he entered the room. It was white and expectant, and to his fears seemed to have an unnatural look upon it. He was afraid of her.

“_Wish!_” she cried, in a strong voice.

“It is foolish and wicked,” he faltered.

“_Wish!_” repeated his wife.

He raised his hand. “I wish my son alive again.”

The talisman fell to the floor, and he regarded it fearfully. Then he sank trembling into a chair as the old woman, with burning eyes, walked to the window and raised the blind.

He sat until he was chilled with the cold, glancing occasionally at the figure of the old woman peering through the window. The candle-end, which had burned below the rim of the china candlestick, was throwing pulsating shadows on the ceiling and walls, until, with a flicker larger than the rest, it expired. The old man, with an unspeakable sense of relief at the failure of the talisman, crept back to his bed, and a minute or two afterward the old woman came silently and apathetically beside him.

Neither spoke, but lay silently listening to the ticking of the clock. A stair creaked, and a squeaky mouse scurried noisily through the wall. The darkness was oppressive, and after lying for some time screwing up his courage, he took the box of matches, and striking one, went downstairs for a candle.

At the foot of the stairs the match went out, and he paused to strike another; and at the same moment a knock, so quiet and stealthy as to be scarcely audible, sounded on the front door.

The matches fell from his hand and spilled in the passage. He stood motionless, his breath suspended until the knock was repeated. Then he turned and fled swiftly back to his room, and closed the door behind him. A third knock sounded through the house.

“_What’s that?_” cried the old woman, starting up.

“A rat,” said the old man in shaking tones—“a rat. It passed me on the stairs.”

His wife sat up in bed listening. A loud knock resounded through the house.

“It’s Herbert!” she screamed. “It’s Herbert!”

She ran to the door, but her husband was before her, and catching her by the arm, held her tightly.

“What are you going to do?” he whispered hoarsely.

“It’s my boy; it’s Herbert!” she cried, struggling mechanically. “I forgot it was two miles away. What are you holding me for? Let go. I must open the door.”

“For God’s sake don’t let it in,” cried the old man, trembling.

“You’re afraid of your own son,” she cried, struggling. “Let me go. I’m coming, Herbert; I’m coming.”

There was another knock, and another. The old woman with a sudden wrench broke free and ran from the room. Her husband followed to the landing, and called after her appealingly as she hurried downstairs. He heard the chain rattle back and the bottom bolt drawn slowly and stiffly from the socket. Then the old woman’s voice, strained and panting.

“The bolt,” she cried, loudly. “Come down. I can’t reach it.”

But her husband was on his hands and knees groping wildly on the floor in search of the paw. If he could only find it before the thing outside got in. A perfect fusillade of knocks reverberated through the house, and he heard the scraping of a chair as his wife put it down in the passage against the door. He heard the creaking of the bolt as it came slowly back, and at the same moment he found the monkey’s paw, and frantically breathed his third and last wish.

The knocking ceased suddenly, although the echoes of it were still in the house. He heard the chair drawn back, and the door opened. A cold wind rushed up the staircase, and a long loud wail of disappointment and misery from his wife gave him courage to run down to her side, and then to the gate beyond. The street lamp flickering opposite shone on a quiet and deserted road.$classic$),
  ('a4c1e000-0000-4000-8000-000000000004', 'archive-yellow-wallpaper', 'The Yellow Wallpaper', 'Charlotte Perkins Gilman',
   'It is very seldom that mere ordinary people like John and myself secure ancestral halls for the summer.',
   'void', 'ARCHIVE SAMPLE', 'live', '1892-01-01T00:00:00Z',
   $classic$It is very seldom that mere ordinary people like John and myself secure ancestral halls for the summer.

A colonial mansion, a hereditary estate, I would say a haunted house, and reach the height of romantic felicity—but that would be asking too much of fate!

Still I will proudly declare that there is something queer about it.

Else, why should it be let so cheaply? And why have stood so long untenanted?

John laughs at me, of course, but one expects that in marriage.

John is practical in the extreme. He has no patience with faith, an intense horror of superstition, and he scoffs openly at any talk of things not to be felt and seen and put down in figures.

John is a physician, and perhaps—(I would not say it to a living soul, of course, but this is dead paper and a great relief to my mind)—perhaps that is one reason I do not get well faster.

You see, he does not believe I am sick!

And what can one do?

If a physician of high standing, and one’s own husband, assures friends and relatives that there is really nothing the matter with one but temporary nervous depression—a slight hysterical tendency—what is one to do?

My brother is also a physician, and also of high standing, and he says the same thing.

So I take phosphates or phosphites—whichever it is, and tonics, and journeys, and air, and exercise, and am absolutely forbidden to “work” until I am well again.

Personally, I disagree with their ideas.

Personally, I believe that congenial work, with excitement and change, would do me good.

But what is one to do?

I did write for a while in spite of them; but it does exhaust me a good deal—having to be so sly about it, or else meet with heavy opposition.

I sometimes fancy that in my condition if I had less opposition and more society and stimulus—but John says the very worst thing I can do is to think about my condition, and I confess it always makes me feel bad.

So I will let it alone and talk about the house.

The most beautiful place! It is quite alone, standing well back from the road, quite three miles from the village. It makes me think of English places that you read about, for there are hedges and walls and gates that lock, and lots of separate little houses for the gardeners and people.

There is a delicious garden! I never saw such a garden—large and shady, full of box-bordered paths, and lined with long grape-covered arbors with seats under them.

There were greenhouses, too, but they are all broken now.

There was some legal trouble, I believe, something about the heirs and co-heirs; anyhow, the place has been empty for years.

That spoils my ghostliness, I am afraid; but I don’t care—there is something strange about the house—I can feel it.

I even said so to John one moonlight evening, but he said what I felt was a draught, and shut the window.

I get unreasonably angry with John sometimes. I’m sure I never used to be so sensitive. I think it is due to this nervous condition.

But John says if I feel so I shall neglect proper self-control; so I take pains to control myself,—before him, at least,—and that makes me very tired.

I don’t like our room a bit. I wanted one downstairs that opened on the piazza and had roses all over the window, and such pretty old-fashioned chintz hangings! but John would not hear of it.

He said there was only one window and not room for two beds, and no near room for him if he took another.

He is very careful and loving, and hardly lets me stir without special direction.

I have a schedule prescription for each hour in the day; he takes all care from me, and so I feel basely ungrateful not to value it more.

He said we came here solely on my account, that I was to have perfect rest and all the air I could get. “Your exercise depends on your strength, my dear,” said he, “and your food somewhat on your appetite; but air you can absorb all the time.” So we took the nursery, at the top of the house.

It is a big, airy room, the whole floor nearly, with windows that look all ways, and air and sunshine galore. It was nursery first and then playground and gymnasium, I should judge; for the windows are barred for little children, and there are rings and things in the walls.

The paint and paper look as if a boys’ school had used it. It is stripped off—the paper—in great patches all around the head of my bed, about as far as I can reach, and in a great place on the other side of the room low down. I never saw a worse paper in my life.

One of those sprawling flamboyant patterns committing every artistic sin.

It is dull enough to confuse the eye in following, pronounced enough to constantly irritate, and provoke study, and when you follow the lame, uncertain curves for a little distance they suddenly commit suicide—plunge off at outrageous angles, destroy themselves in unheard-of contradictions.

The color is repellant, almost revolting; a smouldering, unclean yellow, strangely faded by the slow-turning sunlight.

It is a dull yet lurid orange in some places, a sickly sulphur tint in others.

No wonder the children hated it! I should hate it myself if I had to live in this room long.

There comes John, and I must put this away,—he hates to have me write a word.

We have been here two weeks, and I haven’t felt like writing before, since that first day.

I am sitting by the window now, up in this atrocious nursery, and there is nothing to hinder my writing as much as I please, save lack of strength.

John is away all day, and even some nights when his cases are serious.

I am glad my case is not serious!

But these nervous troubles are dreadfully depressing.

John does not know how much I really suffer. He knows there is no reason to suffer, and that satisfies him.

Of course it is only nervousness. It does weigh on me so not to do my duty in any way!

I meant to be such a help to John, such a real rest and comfort, and here I am a comparative burden already!

Nobody would believe what an effort it is to do what little I am able—to dress and entertain, and order things.

It is fortunate Mary is so good with the baby. Such a dear baby!

And yet I cannot be with him, it makes me so nervous.

I suppose John never was nervous in his life. He laughs at me so about this wallpaper!

At first he meant to repaper the room, but afterwards he said that I was letting it get the better of me, and that nothing was worse for a nervous patient than to give way to such fancies.

He said that after the wallpaper was changed it would be the heavy bedstead, and then the barred windows, and then that gate at the head of the stairs, and so on.

“You know the place is doing you good,” he said, “and really, dear, I don’t care to renovate the house just for a three months’ rental.”

“Then do let us go downstairs,” I said, “there are such pretty rooms there.”

Then he took me in his arms and called me a blessed little goose, and said he would go down cellar if I wished, and have it whitewashed into the bargain.

But he is right enough about the beds and windows and things.

It is as airy and comfortable a room as any one need wish, and, of course, I would not be so silly as to make him uncomfortable just for a whim.

I’m really getting quite fond of the big room, all but that horrid paper.

Out of one window I can see the garden, those mysterious deep-shaded arbors, the riotous old-fashioned flowers, and bushes and gnarly trees.

Out of another I get a lovely view of the bay and a little private wharf belonging to the estate. There is a beautiful shaded lane that runs down there from the house. I always fancy I see people walking in these numerous paths and arbors, but John has cautioned me not to give way to fancy in the least. He says that with my imaginative power and habit of story-making a nervous weakness like mine is sure to lead to all manner of excited fancies, and that I ought to use my will and good sense to check the tendency. So I try.

I think sometimes that if I were only well enough to write a little it would relieve the press of ideas and rest me.

But I find I get pretty tired when I try.

It is so discouraging not to have any advice and companionship about my work. When I get really well John says we will ask Cousin Henry and Julia down for a long visit; but he says he would as soon put fire-works in my pillow-case as to let me have those stimulating people about now.

I wish I could get well faster.

But I must not think about that. This paper looks to me as if it knew what a vicious influence it had!

There is a recurrent spot where the pattern lolls like a broken neck and two bulbous eyes stare at you upside-down.

I get positively angry with the impertinence of it and the everlastingness. Up and down and sideways they crawl, and those absurd, unblinking eyes are everywhere. There is one place where two breadths didn’t match, and the eyes go all up and down the line, one a little higher than the other.

I never saw so much expression in an inanimate thing before, and we all know how much expression they have! I used to lie awake as a child and get more entertainment and terror out of blank walls and plain furniture than most children could find in a toy-store.

I remember what a kindly wink the knobs of our big old bureau used to have, and there was one chair that always seemed like a strong friend.

I used to feel that if any of the other things looked too fierce I could always hop into that chair and be safe.

The furniture in this room is no worse than inharmonious, however, for we had to bring it all from downstairs. I suppose when this was used as a playroom they had to take the nursery things out, and no wonder! I never saw such ravages as the children have made here.

The wallpaper, as I said before, is torn off in spots, and it sticketh closer than a brother—they must have had perseverance as well as hatred.

Then the floor is scratched and gouged and splintered, the plaster itself is dug out here and there, and this great heavy bed, which is all we found in the room, looks as if it had been through the wars.

But I don’t mind it a bit—only the paper.

There comes John’s sister. Such a dear girl as she is, and so careful of me! I must not let her find me writing.

She is a perfect, and enthusiastic housekeeper, and hopes for no better profession. I verily believe she thinks it is the writing which made me sick!

But I can write when she is out, and see her a long way off from these windows.

There is one that commands the road, a lovely, shaded, winding road, and one that just looks off over the country. A lovely country, too, full of great elms and velvet meadows.

This wallpaper has a kind of sub-pattern in a different shade, a particularly irritating one, for you can only see it in certain lights, and not clearly then.

But in the places where it isn’t faded, and where the sun is just so, I can see a strange, provoking, formless sort of figure, that seems to sulk about behind that silly and conspicuous front design.

There’s sister on the stairs!

Well, the Fourth of July is over! The people are gone and I am tired out. John thought it might do me good to see a little company, so we just had mother and Nellie and the children down for a week.

Of course I didn’t do a thing. Jennie sees to everything now.

But it tired me all the same.

John says if I don’t pick up faster he shall send me to Weir Mitchell in the fall.

But I don’t want to go there at all. I had a friend who was in his hands once, and she says he is just like John and my brother, only more so!

Besides, it is such an undertaking to go so far.

I don’t feel as if it was worth while to turn my hand over for anything, and I’m getting dreadfully fretful and querulous.

I cry at nothing, and cry most of the time.

Of course I don’t when John is here, or anybody else, but when I am alone.

And I am alone a good deal just now. John is kept in town very often by serious cases, and Jennie is good and lets me alone when I want her to.

So I walk a little in the garden or down that lovely lane, sit on the porch under the roses, and lie down up here a good deal.

I’m getting really fond of the room in spite of the wallpaper. Perhaps because of the wallpaper.

It dwells in my mind so!

I lie here on this great immovable bed—it is nailed down, I believe—and follow that pattern about by the hour. It is as good as gymnastics, I assure you. I start, we’ll say, at the bottom, down in the corner over there where it has not been touched, and I determine for the thousandth time that I will follow that pointless pattern to some sort of a conclusion.

I know a little of the principle of design, and I know this thing was not arranged on any laws of radiation, or alternation, or repetition, or symmetry, or anything else that I ever heard of.

It is repeated, of course, by the breadths, but not otherwise.

Looked at in one way each breadth stands alone, the bloated curves and flourishes—a kind of “debased Romanesque” with delirium tremens—go waddling up and down in isolated columns of fatuity.

But, on the other hand, they connect diagonally, and the sprawling outlines run off in great slanting waves of optic horror, like a lot of wallowing seaweeds in full chase.

The whole thing goes horizontally, too, at least it seems so, and I exhaust myself in trying to distinguish the order of its going in that direction.

They have used a horizontal breadth for a frieze, and that adds wonderfully to the confusion.

There is one end of the room where it is almost intact, and there, when the cross-lights fade and the low sun shines directly upon it, I can almost fancy radiation after all,—the interminable grotesques seem to form around a common centre and rush off in headlong plunges of equal distraction.

It makes me tired to follow it. I will take a nap, I guess.

I don’t know why I should write this.

I don’t want to.

I don’t feel able.

And I know John would think it absurd. But I must say what I feel and think in some way—it is such a relief!

But the effort is getting to be greater than the relief.

Half the time now I am awfully lazy, and lie down ever so much.

John says I mustn’t lose my strength, and has me take cod-liver oil and lots of tonics and things, to say nothing of ale and wine and rare meat.

Dear John! He loves me very dearly, and hates to have me sick. I tried to have a real earnest reasonable talk with him the other day, and tell him how I wish he would let me go and make a visit to Cousin Henry and Julia.

But he said I wasn’t able to go, nor able to stand it after I got there; and I did not make out a very good case for myself, for I was crying before I had finished.

It is getting to be a great effort for me to think straight. Just this nervous weakness, I suppose.

And dear John gathered me up in his arms, and just carried me upstairs and laid me on the bed, and sat by me and read to me till it tired my head.

He said I was his darling and his comfort and all he had, and that I must take care of myself for his sake, and keep well.

He says no one but myself can help me out of it, that I must use my will and self-control and not let any silly fancies run away with me.

There’s one comfort, the baby is well and happy, and does not have to occupy this nursery with the horrid wallpaper.

If we had not used it that blessed child would have! What a fortunate escape! Why, I wouldn’t have a child of mine, an impressionable little thing, live in such a room for worlds.

I never thought of it before, but it is lucky that John kept me here after all. I can stand it so much easier than a baby, you see.

Of course I never mention it to them any more,—I am too wise,—but I keep watch of it all the same.

There are things in that paper that nobody knows but me, or ever will.

Behind that outside pattern the dim shapes get clearer every day.

It is always the same shape, only very numerous.

And it is like a woman stooping down and creeping about behind that pattern. I don’t like it a bit. I wonder—I begin to think—I wish John would take me away from here!

It is so hard to talk with John about my case, because he is so wise, and because he loves me so.

But I tried it last night.

It was moonlight. The moon shines in all around, just as the sun does.

I hate to see it sometimes, it creeps so slowly, and always comes in by one window or another.

John was asleep and I hated to waken him, so I kept still and watched the moonlight on that undulating wallpaper till I felt creepy.

The faint figure behind seemed to shake the pattern, just as if she wanted to get out.

I got up softly and went to feel and see if the paper did move, and when I came back John was awake.

“What is it, little girl?” he said. “Don’t go walking about like that—you’ll get cold.”

I thought it was a good time to talk, so I told him that I really was not gaining here, and that I wished he would take me away.

“Why darling!” said he, “our lease will be up in three weeks, and I can’t see how to leave before.

“The repairs are not done at home, and I cannot possibly leave town just now. Of course if you were in any danger I could and would, but you really are better, dear, whether you can see it or not. I am a doctor, dear, and I know. You are gaining flesh and color, your appetite is better. I feel really much easier about you.”

“I don’t weigh a bit more,” said I, “nor as much; and my appetite may be better in the evening, when you are here, but it is worse in the morning when you are away.”

“Bless her little heart!” said he with a big hug; “she shall be as sick as she pleases! But now let’s improve the shining hours by going to sleep, and talk about it in the morning!”

“And you won’t go away?” I asked gloomily.

“Why, how can I, dear? It is only three weeks more and then we will take a nice little trip of a few days while Jennie is getting the house ready. Really, dear, you are better!”

“Better in body perhaps”—I began, and stopped short, for he sat up straight and looked at me with such a stern, reproachful look that I could not say another word.

“My darling,” said he, “I beg of you, for my sake and for our child’s sake, as well as for your own, that you will never for one instant let that idea enter your mind! There is nothing so dangerous, so fascinating, to a temperament like yours. It is a false and foolish fancy. Can you not trust me as a physician when I tell you so?”

So of course I said no more on that score, and we went to sleep before long. He thought I was asleep first, but I wasn’t,—I lay there for hours trying to decide whether that front pattern and the back pattern really did move together or separately.

On a pattern like this, by daylight, there is a lack of sequence, a defiance of law, that is a constant irritant to a normal mind.

The color is hideous enough, and unreliable enough, and infuriating enough, but the pattern is torturing.

You think you have mastered it, but just as you get well under way in following, it turns a back somersault and there you are. It slaps you in the face, knocks you down, and tramples upon you. It is like a bad dream.

The outside pattern is a florid arabesque, reminding one of a fungus. If you can imagine a toadstool in joints, an interminable string of toadstools, budding and sprouting in endless convolutions,—why, that is something like it.

That is, sometimes!

There is one marked peculiarity about this paper, a thing nobody seems to notice but myself, and that is that it changes as the light changes.

When the sun shoots in through the east window—I always watch for that first long, straight ray—it changes so quickly that I never can quite believe it.

That is why I watch it always.

By moonlight—the moon shines in all night when there is a moon—I wouldn’t know it was the same paper.

At night in any kind of light, in twilight, candlelight, lamplight, and worst of all by moonlight, it becomes bars! The outside pattern I mean, and the woman behind it is as plain as can be.

I didn’t realize for a long time what the thing was that showed behind,—that dim sub-pattern,—but now I am quite sure it is a woman.

By daylight she is subdued, quiet. I fancy it is the pattern that keeps her so still. It is so puzzling. It keeps me quiet by the hour.

I lie down ever so much now. John says it is good for me, and to sleep all I can.

Indeed, he started the habit by making me lie down for an hour after each meal.

It is a very bad habit, I am convinced, for, you see, I don’t sleep.

And that cultivates deceit, for I don’t tell them I’m awake,—oh, no!

The fact is, I am getting a little afraid of John.

He seems very queer sometimes, and even Jennie has an inexplicable look.

It strikes me occasionally, just as a scientific hypothesis, that perhaps it is the paper!

I have watched John when he did not know I was looking, and come into the room suddenly on the most innocent excuses, and I’ve caught him several times looking at the paper! And Jennie too. I caught Jennie with her hand on it once.

She didn’t know I was in the room, and when I asked her in a quiet, a very quiet voice, with the most restrained manner possible, what she was doing with the paper she turned around as if she had been caught stealing, and looked quite angry—asked me why I should frighten her so!

Then she said that the paper stained everything it touched, that she had found yellow smooches on all my clothes and John’s, and she wished we would be more careful!

Did not that sound innocent? But I know she was studying that pattern, and I am determined that nobody shall find it out but myself!

Life is very much more exciting now than it used to be. You see I have something more to expect, to look forward to, to watch. I really do eat better, and am more quiet than I was.

John is so pleased to see me improve! He laughed a little the other day, and said I seemed to be flourishing in spite of my wallpaper.

I turned it off with a laugh. I had no intention of telling him it was because of the wallpaper—he would make fun of me. He might even want to take me away.

I don’t want to leave now until I have found it out. There is a week more, and I think that will be enough.

I’m feeling ever so much better! I don’t sleep much at night, for it is so interesting to watch developments; but I sleep a good deal in the daytime.

In the daytime it is tiresome and perplexing.

There are always new shoots on the fungus, and new shades of yellow all over it. I cannot keep count of them, though I have tried conscientiously.

It is the strangest yellow, that wallpaper! It makes me think of all the yellow things I ever saw—not beautiful ones like buttercups, but old foul, bad yellow things.

But there is something else about that paper—the smell! I noticed it the moment we came into the room, but with so much air and sun it was not bad. Now we have had a week of fog and rain, and whether the windows are open or not, the smell is here.

It creeps all over the house.

I find it hovering in the dining-room, skulking in the parlor, hiding in the hall, lying in wait for me on the stairs.

It gets into my hair.

Even when I go to ride, if I turn my head suddenly and surprise it—there is that smell!

Such a peculiar odor, too! I have spent hours in trying to analyze it, to find what it smelled like.

It is not bad—at first, and very gentle, but quite the subtlest, most enduring odor I ever met.

In this damp weather it is awful. I wake up in the night and find it hanging over me.

It used to disturb me at first. I thought seriously of burning the house—to reach the smell.

But now I am used to it. The only thing I can think of that it is like is the color of the paper! A yellow smell.

There is a very funny mark on this wall, low down, near the mopboard. A streak that runs round the room. It goes behind every piece of furniture, except the bed, a long, straight, even smooch, as if it had been rubbed over and over.

I wonder how it was done and who did it, and what they did it for. Round and round and round—round and round and round—it makes me dizzy!

I really have discovered something at last.

Through watching so much at night, when it changes so, I have finally found out.

The front pattern does move—and no wonder! The woman behind shakes it!

Sometimes I think there are a great many women behind, and sometimes only one, and she crawls around fast, and her crawling shakes it all over.

Then in the very bright spots she keeps still, and in the very shady spots she just takes hold of the bars and shakes them hard.

And she is all the time trying to climb through. But nobody could climb through that pattern—it strangles so; I think that is why it has so many heads.

They get through, and then the pattern strangles them off and turns them upside-down, and makes their eyes white!

If those heads were covered or taken off it would not be half so bad.

I think that woman gets out in the daytime!

And I’ll tell you why—privately—I’ve seen her!

I can see her out of every one of my windows!

It is the same woman, I know, for she is always creeping, and most women do not creep by daylight.

I see her on that long shaded lane, creeping up and down. I see her in those dark grape arbors, creeping all around the garden.

I see her on that long road under the trees, creeping along, and when a carriage comes she hides under the blackberry vines.

I don’t blame her a bit. It must be very humiliating to be caught creeping by daylight!

I always lock the door when I creep by daylight. I can’t do it at night, for I know John would suspect something at once.

And John is so queer now, that I don’t want to irritate him. I wish he would take another room! Besides, I don’t want anybody to get that woman out at night but myself.

I often wonder if I could see her out of all the windows at once.

But, turn as fast as I can, I can only see out of one at one time.

And though I always see her she may be able to creep faster than I can turn!

I have watched her sometimes away off in the open country, creeping as fast as a cloud shadow in a high wind.

If only that top pattern could be gotten off from the under one! I mean to try it, little by little.

I have found out another funny thing, but I shan’t tell it this time! It does not do to trust people too much.

There are only two more days to get this paper off, and I believe John is beginning to notice. I don’t like the look in his eyes.

And I heard him ask Jennie a lot of professional questions about me. She had a very good report to give.

She said I slept a good deal in the daytime.

John knows I don’t sleep very well at night, for all I’m so quiet!

He asked me all sorts of questions, too, and pretended to be very loving and kind.

As if I couldn’t see through him!

Still, I don’t wonder he acts so, sleeping under this paper for three months.

It only interests me, but I feel sure John and Jennie are secretly affected by it.

Hurrah! This is the last day, but it is enough. John is to stay in town over night, and won’t be out until this evening.

Jennie wanted to sleep with me—the sly thing! but I told her I should undoubtedly rest better for a night all alone.

That was clever, for really I wasn’t alone a bit! As soon as it was moonlight, and that poor thing began to crawl and shake the pattern, I got up and ran to help her.

I pulled and she shook, I shook and she pulled, and before morning we had peeled off yards of that paper.

A strip about as high as my head and half around the room.

And then when the sun came and that awful pattern began to laugh at me I declared I would finish it to-day!

We go away to-morrow, and they are moving all my furniture down again to leave things as they were before.

Jennie looked at the wall in amazement, but I told her merrily that I did it out of pure spite at the vicious thing.

She laughed and said she wouldn’t mind doing it herself, but I must not get tired.

How she betrayed herself that time!

But I am here, and no person touches this paper but me—not alive!

She tried to get me out of the room—it was too patent! But I said it was so quiet and empty and clean now that I believed I would lie down again and sleep all I could; and not to wake me even for dinner—I would call when I woke.

So now she is gone, and the servants are gone, and the things are gone, and there is nothing left but that great bedstead nailed down, with the canvas mattress we found on it.

We shall sleep downstairs to-night, and take the boat home to-morrow.

I quite enjoy the room, now it is bare again.

How those children did tear about here!

This bedstead is fairly gnawed!

But I must get to work.

I have locked the door and thrown the key down into the front path.

I don’t want to go out, and I don’t want to have anybody come in, till John comes.

I want to astonish him.

I’ve got a rope up here that even Jennie did not find. If that woman does get out, and tries to get away, I can tie her!

But I forgot I could not reach far without anything to stand on!

This bed will not move!

I tried to lift and push it until I was lame, and then I got so angry I bit off a little piece at one corner—but it hurt my teeth.

Then I peeled off all the paper I could reach standing on the floor. It sticks horribly and the pattern just enjoys it! All those strangled heads and bulbous eyes and waddling fungus growths just shriek with derision!

I am getting angry enough to do something desperate. To jump out of the window would be admirable exercise, but the bars are too strong even to try.

Besides I wouldn’t do it. Of course not. I know well enough that a step like that is improper and might be misconstrued.

I don’t like to look out of the windows even—there are so many of those creeping women, and they creep so fast.

I wonder if they all come out of that wallpaper as I did?

But I am securely fastened now by my well-hidden rope—you don’t get me out in the road there!

I suppose I shall have to get back behind the pattern when it comes night, and that is hard!

It is so pleasant to be out in this great room and creep around as I please!

I don’t want to go outside. I won’t, even if Jennie asks me to.

For outside you have to creep on the ground, and everything is green instead of yellow.

But here I can creep smoothly on the floor, and my shoulder just fits in that long smooch around the wall, so I cannot lose my way.

Why, there’s John at the door!

It is no use, young man, you can’t open it!

How he does call and pound!

Now he’s crying for an axe.

It would be a shame to break down that beautiful door!

“John dear!” said I in the gentlest voice, “the key is down by the front steps, under a plantain leaf!”

That silenced him for a few moments.

Then he said—very quietly indeed, “Open the door, my darling!”

“I can’t,” said I. “The key is down by the front door under a plantain leaf!”

And then I said it again, several times, very gently and slowly, and said it so often that he had to go and see, and he got it, of course, and came in. He stopped short by the door.

“What is the matter?” he cried. “For God’s sake, what are you doing!”

I kept on creeping just the same, but I looked at him over my shoulder.

“I’ve got out at last,” said I, “in spite of you and Jane! And I’ve pulled off most of the paper, so you can’t put me back!”

Now why should that man have fainted? But he did, and right across my path by the wall, so that I had to creep over him every time!$classic$);

notify pgrst, 'reload schema';
