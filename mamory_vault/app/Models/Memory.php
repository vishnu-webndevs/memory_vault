<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Memory extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'memories';

    public $timestamps = false;

    protected $fillable = [
        'timestamp',
        'content',
        'source',
        'context_tag',
        'immutable',
    ];

    protected $casts = [
        'timestamp' => 'datetime',
        'immutable' => 'boolean',
        'deleted_at' => 'datetime',
    ];
}
