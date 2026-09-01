// 자동 생성 파일 — 직접 고치지 마세요.
// 다시 만들려면: node server/scripts/generate-mazes.mjs
//
// cells 는 칸마다 벽 비트(북1 동2 남4 서8)를 16진수 한 글자로 적은 것이다.
// 왼쪽 위(0,0)에서 출발해 오른쪽 아래에 도착하면 완주다.
// 미로마다 width/height 를 들고 있으므로, 쓰는 쪽에서 크기를 따로 알 필요가 없다.
//
// '상'은 벽에 닿으면 출발점으로 돌아가서 같은 크기면 너무 길다. 그래서 칸 수를
// 줄인 별도 묶음을 쓴다 — 경로가 짧아지고, 화면에 그릴 때 칸이 커져 통로도 넓어진다.

export const MAZE_SETS = {
  "normal": {
    "width": 9,
    "height": 13,
    "mazes": [
      {
        "cells": "d553b9153953a86c3ae96ae956a96969693ac3c3c3ac6947a96c53a956c3956869556c53c56939556b956ac553aa9145796aaae953abc6c547c46",
        "pathLength": 68,
        "width": 9,
        "height": 13
      },
      {
        "cells": "d5393d55393c6c553aac51553c2a97ab9696c6968696b93ab87a92ac68696eac3969693a96a9692c2ad6ad6a96a95693aabac396c6c2c546d5556",
        "pathLength": 50,
        "width": 9,
        "height": 13
      },
      {
        "cells": "d5393d55393c6a9392ac13aac6ae92ea83d296a96ec3ac3aa953aa92eaabaaaae96aac6ac3a96a93a96aa946c683c6c5393aa9553aeaec457c456",
        "pathLength": 64,
        "width": 9,
        "height": 13
      },
      {
        "cells": "d3939139796aaeaac3c56c3ac529395683d2ac6956c3ac53a9556ad3aeab93a96c56aaaa8555546c6a9791553baa96a97aaac69683c2c556d6c56",
        "pathLength": 80,
        "width": 9,
        "height": 13
      },
      {
        "cells": "d55553d5395157c53aad69157c2c53ac553a952c53bc6abc3bac53ac3aac39283c447aaeea955568396c5553ea851795696abc3a93c3c47c46c56",
        "pathLength": 48,
        "width": 9,
        "height": 13
      },
      {
        "cells": "d3b91553b9686a93aac3a96ec42baec3953aaa93aa96aac6a86ad2a93aabc3e86c6c07c3c3979695296a9696d6ad287c393c3c693c6ad4556c556",
        "pathLength": 36,
        "width": 9,
        "height": 13
      },
      {
        "cells": "bd179153bc3c16c3c2bc3c57aba87a9556aaa96a9552aaa96c53c6aa853bc3b86e96c3c2c556d147ad1553a9569693c6c3b83ac393aaec47c6c46",
        "pathLength": 60,
        "width": 9,
        "height": 13
      },
      {
        "cells": "bd1153953c3ac3ea92bac7856aaac53e93aa879696aae856d2ba83c3d16aaeaba96d2a92aaa93aaaeac6ac2ac385543ac52c3956e956d6c555457",
        "pathLength": 42,
        "width": 9,
        "height": 13
      },
      {
        "cells": "d5395391393c696aaaac13ad6aaabaec396ac2c53aa96bc53c6ac3c53a956ba952c69386ad2b96c6b8386c3b92aae956c6aac56d1392c55556c6e",
        "pathLength": 86,
        "width": 9,
        "height": 13
      },
      {
        "cells": "d3d555553bc539553ac13aa97c292ec68556aa953c53baec3c396a817c3c692ac17c3d6ac3c13c396ba96c3ac3aac3d6a92aabc556aac4455556e",
        "pathLength": 72,
        "width": 9,
        "height": 13
      },
      {
        "cells": "d5395551397ac3956aa9696c3baaa9693a8686c7ac6abc553a97c29396aa93aaec56aac6c513b8693956c6c56aa9555517aaa9539696c46d6c547",
        "pathLength": 58,
        "width": 9,
        "height": 13
      },
      {
        "cells": "b93d53913c6c53c6aa913bc53aeaac695683ea956b96a96a93847a856ec4396a9153d6c3aec3c553ac53ab956a97c6aa93a839546aaaec45556c6",
        "pathLength": 56,
        "width": 9,
        "height": 13
      },
      {
        "cells": "d5395515397aa956d2c3aac553a92aab956aaeac2a956856baaa97a93aaaac3c6ac2ac3a93c3eabaaa87c3aac2ac13c683aa96c556eaec5555556",
        "pathLength": 56,
        "width": 9,
        "height": 13
      },
      {
        "cells": "bb95513d3ac693ac3ac396a83c6bc6baec538152c5552aa969793aaac5296aaac3baabc6c3ac2c29396c3c3c6aad3c3e956c3a9696d3d46c54556",
        "pathLength": 42,
        "width": 9,
        "height": 13
      },
      {
        "cells": "bb9539513ac29687aac3e83a96ebc3eaac5387c3aad3a817aa856aac3ac6956c3c693a93ba916ac6a86aabc552a96ac517aac7c53a96c55556c47",
        "pathLength": 48,
        "width": 9,
        "height": 13
      },
      {
        "cells": "d39513953bae96ac3aac3a96d6a83c6c3952ac553c6bac7954556a93a955556aaac39153aaa96ead2aaac5383aac6956aaea93c53ec3c6c554556",
        "pathLength": 46,
        "width": 9,
        "height": 13
      },
      {
        "cells": "bd13d5513c56a953aa917c696eaac157ad12abc39696ac43aa96bab96aa83c6ac3c6ec5383ad1553aac696d3c2ad541383ac393eaaead46c56c56",
        "pathLength": 68,
        "width": 9,
        "height": 13
      },
      {
        "cells": "d55553d5395153c552abc3c557ac29695396bac5696ab86913c3aac3eac3c6abc3abad5287c686956a9556d453aa9155396aaec3bac3c4556c456",
        "pathLength": 74,
        "width": 9,
        "height": 13
      },
      {
        "cells": "b95153953ac783c696c53ea93c397c56ea96c139552c396ac3b87ac3c3a869696d46e96ba955556d2aad15553a8696d17c2ad291693ac56ec56c6",
        "pathLength": 56,
        "width": 9,
        "height": 13
      },
      {
        "cells": "d3915555396ea93956a9386ac57c6ac7c553d3c55553a9453b956aa9546a952ac395683ead6a93ac38556eaa96c5553c6c3953969392c7c456c6e",
        "pathLength": 44,
        "width": 9,
        "height": 13
      }
    ]
  },
  "hard": {
    "width": 8,
    "height": 11,
    "mazes": [
      {
        "cells": "d5393d5397c6a93ac553aac29516a83ec3a96ec396aa953aa96aabaaaa96aac2aea96c3a83aa916aec46ec56",
        "pathLength": 33,
        "width": 8,
        "height": 11
      },
      {
        "cells": "d393913b96aaeaaac56c3ac29395683eac6956c3c53a9552d3aea95696c56c538179153aac3aad6ac7c6c556",
        "pathLength": 41,
        "width": 8,
        "height": 11
      },
      {
        "cells": "d3b9515396aabc3ec3aa87c3bac46952aa9396d6ac6a8553a93aa97a86c6aa96c393aac396ec4692c555556e",
        "pathLength": 33,
        "width": 8,
        "height": 11
      },
      {
        "cells": "bd115553c3ac553ebac517c3ac53e93a879696aa856d2baac3d16aaaba9692aaaaa96aaaac683eaac556c546",
        "pathLength": 35,
        "width": 8,
        "height": 11
      },
      {
        "cells": "d3d55553bc539552c13aa95696ac6c53aba93d3aac46c16aa9395696c6ac396b956d6c52a9395556c6c45557",
        "pathLength": 37,
        "width": 8,
        "height": 11
      },
      {
        "cells": "d53b955397a86952a9687c3aaa9693aa86c7ac6ac553a93a9396aac6aac56ad3ac517c52ad3c553ac54557c6",
        "pathLength": 45,
        "width": 8,
        "height": 11
      },
      {
        "cells": "b93d5153c6c53c7a9153c53aead6956a9295693aaea956c2856c513ea9153ec3aec3c552c53ab956d546c457",
        "pathLength": 43,
        "width": 8,
        "height": 11
      },
      {
        "cells": "d539551397aa956ec3aac55392aab952aeac2a96856baac3a9386abac6ac3a8693c3eaabac7c3ac2c55546d6",
        "pathLength": 41,
        "width": 8,
        "height": 11
      },
      {
        "cells": "b955513bac793aaac396aac6bc6bac538512c552e96ad17a96d45696855553abad513c6aa93aad12c6c6c56e",
        "pathLength": 45,
        "width": 8,
        "height": 11
      },
      {
        "cells": "b915553bae83d546c3ea9553bc3c295287c3aad2817aac3aac3aa96ac3c6aababab96ac686c47c53c5555556",
        "pathLength": 29,
        "width": 8,
        "height": 11
      },
      {
        "cells": "d3955513ba87956aaaa96d56aaaa9393aaac686aaae93c7aaa96c392aac3baaeac3a86c387c6c392c555546e",
        "pathLength": 31,
        "width": 8,
        "height": 11
      },
      {
        "cells": "d3951397bae96a83ac3a96ea87c6c392c1393c6a96c6a97a853d4696a969396bea96ac5296abc17ac5447c56",
        "pathLength": 31,
        "width": 8,
        "height": 11
      },
      {
        "cells": "bb955153ac479696a953ad43c696a93ed3c3aac3969686ba83c3c56ae83c555296e93956a93ac693c6c4556e",
        "pathLength": 35,
        "width": 8,
        "height": 11
      },
      {
        "cells": "d395513b96e956c6a9383953c6aec47a97c55552813d3956ea856a9396a956aaad6ad56a85569392c5556c6e",
        "pathLength": 39,
        "width": 8,
        "height": 11
      },
      {
        "cells": "bb915553ac6ab956c556ac3b979147c2856c5556c53d555393c55392ac513aaa8792eaaea96e96c3ec554556",
        "pathLength": 43,
        "width": 8,
        "height": 11
      },
      {
        "cells": "b9517913aad696aea8556bc3a8553c3aae93c52aa96c3d6ac697c392978556aaa96d516a86d156bac556d546",
        "pathLength": 39,
        "width": 8,
        "height": 11
      },
      {
        "cells": "d53d55539569553aad54396ac5556ad2d1397c3a96a853aa83ac3ac2aac3e87aead416969693e96bc56c5456",
        "pathLength": 33,
        "width": 8,
        "height": 11
      },
      {
        "cells": "bd151553c387c39696e956c3a9569396c6b96aab93a87ac2aac6947aac51693a853a96c6a96ec553ec555556",
        "pathLength": 41,
        "width": 8,
        "height": 11
      },
      {
        "cells": "d391395396aaaabac3eaec2abc3c53aa856956aaad54556ac55539569557ac53a955695286953abac56d46c6",
        "pathLength": 37,
        "width": 8,
        "height": 11
      },
      {
        "cells": "d539513bb96c3aaaaad56ac6ac393c1383aac3eaaeaad292c3ac3c6a96a96b96856a92c3c396ae96d46d4547",
        "pathLength": 45,
        "width": 8,
        "height": 11
      }
    ]
  }
};
