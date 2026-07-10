package com.beisong.app.domain

enum class QuestionType(val value: String) {
    Choice("choice"),
    Blank("blank"),
    ContextBlank("context_blank"),
    ContextRecitation("context_recitation"),
    PureRecitation("pure_recitation"),
    Ordering("ordering")
}
