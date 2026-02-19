<?php

namespace Database\Seeders;

use App\Models\Memory;
use Illuminate\Database\Seeder;

class MemorySeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $samples = [
            [
                'content' => 'System initialized and configuration loaded.',
                'source' => 'seed',
                'context_tag' => 'system',
                'immutable' => true,
            ],
            [
                'content' => 'User created first project: Memory Vault.',
                'source' => 'seed',
                'context_tag' => 'activity',
                'immutable' => false,
            ],
            [
                'content' => 'Permissions adjusted to allow schema creation and migrations.',
                'source' => 'seed',
                'context_tag' => 'ops',
                'immutable' => false,
            ],
        ];

        foreach ($samples as $data) {
            Memory::create($data);
        }
    }
}
