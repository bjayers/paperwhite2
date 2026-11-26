#ifndef POKEBW2_PAPERWHITE2_ROAMER_ACTIONS_H
#define POKEBW2_PAPERWHITE2_ROAMER_ACTIONS_H

// Paper White 2: the actions of the roaming legendaries' script command, Roamers action, arg1, arg2, result
// (include/paperwhite2/roamers.h), and its targets. Only #defines, since the scripts include it, with
// paperwhite2/roamers_config.h for the ROAMER_* and ROAMER_GROUP_* names. For example, an event that releases the
// beasts:
//     Roamers ROAMERS_ACTION_RELEASE, ROAMERS_TARGET_GROUP + ROAMER_GROUP_BEASTS, 0, 0x800C

// arg1 a target: releases each roamer of it that isn't released yet, onto a free route; returns how many
#define ROAMERS_ACTION_RELEASE 0
// arg1 a roamer (ROAMER_*): returns its state, ROAMERS_STATE_* below
#define ROAMERS_ACTION_GET_STATE 1
// arg1 a roamer: returns its route's first zone while it roams, else 0xffff
#define ROAMERS_ACTION_GET_ZONE 2

// A target: a roamer (ROAMER_*), a group (ROAMERS_TARGET_GROUP + ROAMER_GROUP_*), or all
#define ROAMERS_TARGET_GROUP 0x100
#define ROAMERS_TARGET_ALL 0x200

// paperwhite2/roamers.h's ROAMER_STATE_*, for the scripts
#define ROAMERS_STATE_UNRELEASED 0
#define ROAMERS_STATE_ROAMING 1
#define ROAMERS_STATE_KNOCKED_OUT 2
#define ROAMERS_STATE_CAUGHT 3

#endif // POKEBW2_PAPERWHITE2_ROAMER_ACTIONS_H
