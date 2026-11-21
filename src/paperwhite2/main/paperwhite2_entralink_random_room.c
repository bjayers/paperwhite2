#include "types.h"
#include "paperwhite2/entralink_random_rooms.h"

// Paper White 2: the random room made last (paperwhite2/entralink_random_rooms.h), in ARM9 main so that it outlasts
// the battle, which frees the field's overlays; overlay 12 makes it as the player enters the room

static EntralinkRandomRoom sRandomRoom;

EntralinkRandomRoom *EntralinkRun_GetRandomRoom(void) {
    return &sRandomRoom;
}
