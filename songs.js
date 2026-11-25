/* =========================================================================
   TYPEBEAT - TRACKS & SONG DATA
   Supports both VocaType Lyric Flow and YouType Dictation Modes
   Each cue includes start/pause timestamps, lyrics, and optional translations.
   ========================================================================= */

const TRACKS = {
  youth: {
    name: "Youth (16+)",
    badge: "Trending Hits & Beats",
    color: "indigo",
    levels: [
      {
        id: "youth-1",
        title: "Shawn Mendes - Treat You Better",
        artist: "Shawn Mendes",
        sub: "Pop Hit • Reference Track from VocaType",
        videoId: "lY2yjAdbvdQ",
        difficulty: "Intermediate",
        lines: [
          {
            start: 35.0,
            pause: 39.8,
            sentence: "I won't lie to you",
            target: "lie",
            before: "I won't",
            after: "to you",
            translation: "ฉันจะไม่โกหกคุณเลย"
          },
          {
            start: 39.8,
            pause: 44.5,
            sentence: "I know he's just not right for you",
            target: "right",
            before: "I know he's just not",
            after: "for you",
            translation: "ฉันรู้ว่าเขาไม่เหมาะกับคุณเลย"
          },
          {
            start: 44.5,
            pause: 48.0,
            sentence: "And you can tell me if I'm off",
            target: "off",
            before: "And you can tell me if I'm",
            after: "",
            translation: "และคุณบอกฉันได้ถ้าฉันคิดผิดไป"
          },
          {
            start: 48.0,
            pause: 51.5,
            sentence: "But I see it on your face",
            target: "face",
            before: "But I see it on your",
            after: "",
            translation: "แต่ฉันเห็นมันชัดเจนบนใบหน้าของคุณ"
          },
          {
            start: 51.5,
            pause: 55.5,
            sentence: "when you say that he's the one that you want",
            target: "want",
            before: "when you say that he's the one that you",
            after: "",
            translation: "เวลาที่คุณบอกว่าเขาคือคนที่คุณต้องการ"
          },
          {
            start: 55.5,
            pause: 59.5,
            sentence: "And you're spending all your time",
            target: "spending",
            before: "And you're",
            after: "all your time",
            translation: "และคุณต้องทุ่มเทเวลาทั้งหมดของคุณ"
          },
          {
            start: 59.5,
            pause: 63.8,
            sentence: "In this wrong situation",
            target: "wrong",
            before: "In this",
            after: "situation",
            translation: "อยู่ในสถานการณ์ที่ไม่ถูกต้องนี้"
          },
          {
            start: 63.8,
            pause: 68.0,
            sentence: "And anytime you want it to stop",
            target: "stop",
            before: "And anytime you want it to",
            after: "",
            translation: "และเมื่อไหร่ก็ตามที่คุณอยากให้มันหยุดลง"
          },
          {
            start: 68.0,
            pause: 73.0,
            sentence: "I know I can treat you better",
            target: "better",
            before: "I know I can treat you",
            after: "",
            translation: "ฉันรู้ว่าฉันดูแลคุณได้ดีกว่านี้"
          },
          {
            start: 73.0,
            pause: 77.5,
            sentence: "Than he can",
            target: "than",
            before: "",
            after: "he can",
            translation: "ดีกว่าที่เขาจะทำได้"
          }
        ]
      },
      {
        id: "youth-2",
        title: "Imagine Dragons - Believer",
        artist: "Imagine Dragons",
        sub: "High-Energy Anthem • Fast Rhythm",
        videoId: "7wtfhZwyrcc",
        difficulty: "Fast Speed",
        lines: [
          {
            start: 13.0,
            pause: 17.5,
            sentence: "First things first",
            target: "first",
            before: "First things",
            after: "",
            translation: "อย่างแรกที่สุดเลยนะ"
          },
          {
            start: 17.5,
            pause: 22.0,
            sentence: "I'mma say all the words inside my head",
            target: "words",
            before: "I'mma say all the",
            after: "inside my head",
            translation: "ฉันจะพูดทุกคำที่อยู่ในหัวออกมา"
          },
          {
            start: 22.0,
            pause: 26.5,
            sentence: "I'm fired up and tired of the way that things have been",
            target: "fired",
            before: "I'm",
            after: "up and tired of the way things have been",
            translation: "ฉันเดือดและเบื่อหน่ายกับสิ่งที่เป็นอยู่เต็มที"
          },
          {
            start: 32.0,
            pause: 37.0,
            sentence: "Pain! You made me a believer",
            target: "believer",
            before: "Pain! You made me a",
            after: "",
            translation: "ความเจ็บปวด! เธอสร้างฉันให้กลายเป็นผู้ศรัทธา"
          }
        ]
      },
      {
        id: "youth-3",
        title: "GTA VI - Official Trailer 1",
        artist: "Rockstar Games",
        sub: "Dialogue & Cinematic Subtitles",
        videoId: "QdBZY2fkU-0",
        difficulty: "Dialogue Pace",
        lines: [
          {
            start: 18.0,
            pause: 23.5,
            sentence: "The only way we're gonna get through this is by sticking together",
            target: "sticking",
            before: "The only way we're gonna get through this is by",
            after: "together",
            translation: "ทางเดียวที่เราจะรอดคือต้องจับมือไปด้วยกัน"
          },
          {
            start: 23.5,
            pause: 27.0,
            sentence: "Trust? Trust.",
            target: "trust",
            before: "",
            after: "? Trust.",
            translation: "เชื่อใจไหม? เชื่อใจสิ"
          }
        ]
      }
    ]
  },
  kids: {
    name: "Kids (8–15)",
    badge: "Animated & Disney Classics",
    color: "amber",
    levels: [
      {
        id: "kids-1",
        title: "Frozen - Let It Go",
        artist: "Idina Menzel",
        sub: "Disney Animated Hit • Melodic & Clear",
        videoId: "L0MK7qz13bU",
        difficulty: "Beginner",
        lines: [
          {
            start: 11.5,
            pause: 17.5,
            sentence: "The snow glows white on the mountain tonight",
            target: "snow",
            before: "The",
            after: "glows white on the mountain tonight",
            translation: "หิมะเปล่งประกายสีขาวบนยอดเขาค่ำคืนนี้"
          },
          {
            start: 18.0,
            pause: 23.0,
            sentence: "Not a footprint to be seen",
            target: "footprint",
            before: "Not a",
            after: "to be seen",
            translation: "ไร้ร่องรอยฝ่าเท้าของผู้ใด"
          },
          {
            start: 23.0,
            pause: 28.5,
            sentence: "A kingdom of isolation and it looks like I'm the queen",
            target: "queen",
            before: "A kingdom of isolation and it looks like I'm the",
            after: "",
            translation: "อาณาจักรแห่งความโดดเดี่ยว และดูเหมือนฉันคือราชินี"
          },
          {
            start: 28.5,
            pause: 34.0,
            sentence: "The wind is howling like this swirling storm inside",
            target: "storm",
            before: "The wind is howling like this swirling",
            after: "inside",
            translation: "สายลมคำรามเหมือนพายุที่หมุนวนอยู่ภายในใจ"
          },
          {
            start: 34.0,
            pause: 39.5,
            sentence: "Couldn't keep it in, heaven knows I tried",
            target: "tried",
            before: "Couldn't keep it in, heaven knows I",
            after: "",
            translation: "ไม่อาจกักเก็บมันไว้ สวรรค์รู้ดีว่าฉันพยายามแล้ว"
          }
        ]
      },
      {
        id: "kids-2",
        title: "The Super Mario Bros. Movie",
        artist: "The Super Mario Bros. Movie",
        sub: "Animated Adventure • Beginner Vocabulary",
        videoId: "TnGl01FkMMo",
        difficulty: "Beginner",
        lines: [
          {
            start: 26.0,
            pause: 31.0,
            sentence: "Welcome to the Mushroom Kingdom",
            target: "Mushroom",
            before: "Welcome to the ",
            after: " Kingdom",
            translation: "ยินดีต้อนรับสู่อาณาจักรเห็ด"
          },
          {
            start: 40.0,
            pause: 45.0,
            sentence: "We have to go save the princess from Bowser",
            target: "princess",
            before: "We have to go save the ",
            after: " from Bowser",
            translation: "เราต้องไปช่วยเจ้าหญิงจากบาวเซอร์"
          },
          {
            start: 53.0,
            pause: 58.0,
            sentence: "This is going to be the biggest adventure of our lives",
            target: "adventure",
            before: "This is going to be the biggest ",
            after: " of our lives",
            translation: "นี่จะเป็นการผจญภัยครั้งใหญ่ที่สุดในชีวิตของเรา"
          }
        ]
      },
      {
        id: "kids-3",
        title: "Moana - How Far I'll Go",
        artist: "Auli'i Cravalho",
        sub: "Inspiring Disney Anthem",
        videoId: "cPAbx5kgCJo",
        difficulty: "Intermediate",
        lines: [
          {
            start: 13.0,
            pause: 18.0,
            sentence: "I've been staring at the edge of the water",
            target: "water",
            before: "I've been staring at the edge of the",
            after: "",
            translation: "ฉันเฝ้ามองขอบชายน้ำมาโดยตลอด"
          },
          {
            start: 18.0,
            pause: 23.5,
            sentence: "Long as I can remember, never really knowing why",
            target: "remember",
            before: "Long as I can",
            after: ", never really knowing why",
            translation: "เนิ่นนานเท่าที่จำความได้ โดยไม่เคยรู้เหตุผลเลย"
          },
          {
            start: 23.5,
            pause: 28.5,
            sentence: "I wish I could be the perfect daughter",
            target: "daughter",
            before: "I wish I could be the perfect",
            after: "",
            translation: "ฉันหวังว่าตัวเองจะเป็นลูกสาวที่สมบูรณ์แบบได้"
          }
        ]
      }
    ]
  }
};
