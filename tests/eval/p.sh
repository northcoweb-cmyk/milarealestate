#!/bin/bash
# usage: p.sh '<json array>' [SEED=1]
cd /home/user/milarealestate && node --import tsx tests/eval/probe.mts "$1" 2>&1 | cut -c1-700
