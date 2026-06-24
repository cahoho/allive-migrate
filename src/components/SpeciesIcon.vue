<script setup lang="ts">
import { SpeciesIcon } from '../data/gameConfig'

const props = defineProps<{
  type: SpeciesIcon
  color: string
  size?: number
}>()
const sz = props.size ?? 22
</script>

<template>
  <svg :width="sz" :height="sz" :viewBox="`-${sz/2} -${sz/2} ${sz} ${sz}`" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <g v-if="type === 'bird'">
      <path d="M -10 4 L 0 -4 L 10 4" :stroke="color" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="0" cy="0" r="2.2" :fill="color" />
    </g>
    <g v-else-if="type === 'butterfly'">
      <ellipse cx="-5" cy="-2" rx="4.5" ry="6" :fill="color" opacity="0.85" transform="rotate(-15 -5 -2)" />
      <ellipse cx="5" cy="-2" rx="4.5" ry="6" :fill="color" opacity="0.85" transform="rotate(15 5 -2)" />
      <ellipse cx="-3" cy="4" rx="2.5" ry="3.5" :fill="color" opacity="0.7" />
      <ellipse cx="3" cy="4" rx="2.5" ry="3.5" :fill="color" opacity="0.7" />
      <line x1="0" y1="-6" x2="0" y2="6" :stroke="color" stroke-width="1.2" />
    </g>
    <g v-else-if="type === 'fish'">
      <ellipse cx="-1" cy="0" rx="7" ry="4" :fill="color" />
      <polygon points="6,0 11,-4 11,4" :fill="color" />
      <circle cx="-4" cy="-1" r="0.8" fill="white" />
      <line x1="-3" y1="1" x2="3" y2="1" :stroke="color" stroke-width="0.6" opacity="0.5" />
    </g>
    <g v-else-if="type === 'herd'">
      <circle cx="-5" cy="0" r="3" :fill="color" />
      <circle cx="2" cy="-2" r="3.5" :fill="color" />
      <circle cx="5" cy="3" r="2.5" :fill="color" />
    </g>
    <g v-else-if="type === 'turtle'">
      <ellipse cx="0" cy="0" rx="9" ry="6" :fill="color" />
      <ellipse cx="0" cy="0" rx="6" ry="4" :fill="color" opacity="0.45" />
      <circle cx="-9" cy="3" r="2" :fill="color" />
      <circle cx="-9" cy="-3" r="2" :fill="color" />
      <line x1="-7" y1="0" x2="9" y2="0" :stroke="color" stroke-width="0.5" opacity="0.4" />
    </g>
    <g v-else-if="type === 'frog'">
      <ellipse cx="0" cy="1" rx="8" ry="6" :fill="color" />
      <circle cx="-4" cy="-4" r="3" :fill="color" />
      <circle cx="4" cy="-4" r="3" :fill="color" />
      <circle cx="-4" cy="-4" r="1.4" fill="white" />
      <circle cx="4" cy="-4" r="1.4" fill="white" />
      <circle cx="-4" cy="-4" r="0.6" fill="black" />
      <circle cx="4" cy="-4" r="0.6" fill="black" />
    </g>
  </svg>
</template>
