<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('memories', function (Blueprint $table) {
            $table->id();
            $table->timestamp('timestamp')->useCurrent();
            $table->text('content');
            $table->string('source');
            $table->string('context_tag');
            $table->boolean('immutable')->default(false);
            $table->softDeletes(); // deleted_at

            // Indexes for common query fields
            $table->index('timestamp');
            $table->index('source');
            $table->index('context_tag');
            $table->index('immutable');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('memories');
    }
};
