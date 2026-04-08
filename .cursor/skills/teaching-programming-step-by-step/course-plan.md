# Programming Teaching Course Plan

This file defines the standard course structure for practical programming обучения step by step.

It is intended to support the `teaching-programming-step-by-step` skill and can be reused for different subjects such as:
- neural networks
- Node.js servers
- C++
- data structures and algorithms
- frontend development
- testing and architecture

## Main Goal

The goal of this plan is to make learning:
- structured
- practical
- progressive
- understandable for learners who may know programming basics but are new to the subject

The course should help the learner move from orientation and understanding toward a working implementation.

## Core Teaching Principles

1. Start with orientation before implementation.
2. Move from simple to complex.
3. Introduce terminology gradually.
4. Make code the primary proof of progress.
5. Keep lessons small and finishable.
6. Tie every step to concrete files, modules, and architecture.
7. Review learner submissions like code review, not like an oral exam.

## How A New Course Starts

Before the first practical lesson, provide an expanded introductory section.

That opening should answer:
- What are we studying?
- Why does this topic matter?
- What main approaches exist?
- Which approach is chosen for this course?
- Why was it chosen?
- How many lessons or stages are planned?
- What will the learner have by the end?

## Required Opening Structure

### 1. What We Are Studying

Explain the topic in plain language.

Examples:
- "We are learning how to build a neural-network-controlled snake bot."
- "We are learning how to build a backend server in Node.js."
- "We are learning modern C++ through small practical modules."

This section should be more detailed than a normal lesson intro, but still practical.

### 2. Main Approaches

Explain the main relevant approaches for the topic.

The goal is not an academic survey.  
The goal is to orient the learner.

Examples:

For neural networks:
- imitation learning
- reinforcement learning
- hybrid path

For Node.js servers:
- raw `http`
- Express
- Fastify
- framework-heavy approaches

For C++:
- procedural introduction
- object-oriented introduction
- STL-first modern style
- memory-focused low-level route

### 3. Chosen Approach

State which path this course will use and why.

Good reasons:
- easier for a beginner
- fits the current project
- gives visible progress faster
- reduces complexity at the start
- creates a better foundation for later stages

### 4. Course Plan

Provide the staged roadmap.

For each lesson or stage, state:
- the title
- the practical goal
- how it builds on the previous stage

### 5. Final Result

Explain what the learner will have at the end:
- working feature
- working server
- trained bot
- compiled application
- tested module
- practical understanding of the chosen approach

### 6. How We Will Work

Always explain the process:
- lessons are step-by-step
- theory is heavier at the course start, lighter inside individual lessons
- the learner writes code after each stage
- the learner can ask clarifying questions at any point
- after writing code the learner can send it for review
- the learner can say `проверяй` to trigger review mode

## Standard Lesson Structure

After the course opening, each lesson should follow a smaller repeatable structure.

### Lesson Title

A short concrete title.

Examples:
- "Encode the model input"
- "Implement the first forward pass"
- "Connect the network to the arena"
- "Create the first Node.js route"
- "Implement a C++ vector wrapper"

### What We Are Building

Explain the lesson goal in plain language.

Keep this practical and specific.

### New Terms

Introduce only the terms required for the lesson.

Recommended style:
- simple explanation first
- English term in parentheses

Example:
- Observation (`observation`) — all input data the program receives before making a decision.

### Where This Goes In The Project

Specify:
- which file to create
- which file to edit
- why this location is correct
- how the new code fits the architecture
- what should not be changed yet

### What The Learner Must Implement

For each required unit, state:
- function, class, or module name
- argument types
- return type
- exact behavior
- important edge cases

For main implementation code:
- provide the types if helpful
- do not provide a near-complete final implementation by default
- let the learner write the core logic

### Tests

Explain what the tests should verify.

Tests can be guided more explicitly than production code.

Typical test categories:
- happy path
- edge cases
- invalid inputs
- integration boundaries
- regression checks for the current lesson

### Completion Criteria

State exactly what must exist for the lesson to count as complete.

Examples:
- required file exists
- required functions are present
- tests cover the target behavior
- no blocking logic errors remain

### What To Send For Review

Tell the learner exactly what to send back.

Examples:
- implementation file
- test file
- both implementation and tests

### Hints

Hints must come at the end of the lesson, not immediately after the task.

This gives the learner a chance to think independently.

## Code Review Phase

When the learner sends code, switch into review mode.

Typical user triggers:
- `проверяй`
- `проверь`
- `review`
- `посмотри решение`

### Review Goals

The review should answer:
- Is the code correct?
- Are there edge cases missing?
- Are the tests good enough?
- Does the implementation fit the intended architecture?
- Is the lesson complete?

### Standard Review Structure

#### Findings

List blockers first.

Focus on:
- correctness
- edge cases
- unsafe assumptions
- architecture mismatches
- weak tests

#### What Is Good

Mention what is already correct or well designed.

#### Completion Status

Say explicitly one of:
- lesson not complete
- lesson almost complete
- lesson complete

#### Next Fixes

List only the minimum required changes to proceed.

## Error Handling Teaching Rule

When connecting modules, teach validation at the boundary.

Examples:
- encoded observation length must match network input size
- parsed config must match schema
- request body must match expected DTO
- file format must match parser assumptions

Recommended pattern:
1. validate at the integration boundary
2. throw or return a meaningful error
3. catch errors at the correct higher layer
4. test both valid and invalid cases

## How This Plan Applies To Different Subjects

### Neural Networks

Typical flow:
1. course overview and learning approaches
2. input encoding
3. simple network structure
4. connecting the network to the existing system
5. displaying results
6. pretraining
7. training loop
8. comparison and evaluation

### Node.js Server

Typical flow:
1. course overview and server architecture options
2. minimal server setup
3. first route
4. request parsing and validation
5. modular routing
6. storage or database integration
7. tests
8. deployment-ready cleanup

### C++

Typical flow:
1. course overview and style choices
2. basic compilation setup
3. simple functions and data types
4. classes and constructors
5. ownership and memory basics
6. STL usage
7. modularization
8. tests or validation

## Success Criteria For The Full Course

A course is successful when:
- the learner understands the chosen path
- the learner can implement each stage in code
- the learner gets review feedback after each stage
- terminology is introduced gradually rather than dumped at once
- the learner finishes with a working practical result

## Notes For Reuse

This plan is intentionally general.

It should be reused across different domains while preserving the same teaching process:
- expanded theory at the start
- clear approach selection
- lesson roadmap
- practical implementation
- code review after each step
- hints at the end

The domain changes.  
The teaching process stays consistent.
